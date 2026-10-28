# Arsitektur

Bagian ini membahas cara kerja di dalam simulator: komponennya, urutan operasi yang penting, dan apa yang terjadi saat ada yang gagal.

## Gambaran umum

```text
Klien ──HTTP /v1──▶ routes → plugin → controller → service
                                                 │
                              PaymentService ────┼──▶ TransactionStore (memori)
                                                 │
                                                 └─ enqueue ─▶ WebhookQueue (memori atau Redis)
                                                                     │
                       penyapu kedaluwarsa (tiap 1 detik) ─▶ ...     │ claimDue / ack
                                                                     ▼
                                                              WebhookWorker ──POST──▶ callback_url
```

Ada dua hal yang berjalan di background: penyapu transaksi kedaluwarsa (tiap detik) dan worker webhook (tiap `WEBHOOK_TICK_MS`).

| Folder         | Isinya                                                               |
| -------------- | -------------------------------------------------------------------- |
| `routes/`      | Definisi endpoint dan skema validasi JSON                            |
| `plugins/`     | Cek `X-Client-Key`, simulasi latensi dan error, penanganan error     |
| `controllers/` | Menerjemahkan request ke pemanggilan service, lalu membentuk respons |
| `services/`    | Aturan status, pembuatan QRIS, VA, e-Wallet, dan signature           |
| `queues/`      | Antrean webhook dan worker pengirimnya                               |

## Status transaksi

```text
PENDING ──simulate/pay────▶ PAID
   ├────simulate/fail─────▶ FAILED
   └────simulate/expire───▶ EXPIRED   (juga otomatis saat expires_at terlewat)
```

`PAID`, `FAILED`, dan `EXPIRED` adalah status final. Tidak ada jalan kembali.

### Urutan saat status berubah

Semua perubahan status lewat `PaymentService.transition` dengan urutan ini:

1. Cek status masih `PENDING`. Kalau tidak, balas `409 INVALID_TRANSACTION_STATE`.
2. Tandai transaksi sedang diproses. Kalau sudah ditandai request lain, balas `409 TRANSACTION_BUSY`.
3. Bentuk payload dan signature webhook untuk status tujuan.
4. Masukkan webhook ke antrean.
5. Baru ubah status di memori, lalu lepas tandanya.

Urutan ini punya dua manfaat:

- Kalau antrean gagal, status tetap `PENDING`. Klien bisa mencoba lagi tanpa kehilangan notifikasi.
- Webhook tidak pernah dijadwalkan untuk status yang akhirnya tidak tercapai.

Tanda sedang diproses (langkah 2) mencegah dua request bersamaan lolos cek status lalu sama-sama mengirim webhook. Node.js berjalan satu thread, jadi blok kode yang sinkron aman. Celahnya hanya ada di `await` antrean, dan tanda itu yang menutupnya.

## Antrean webhook

Ada dua implementasi dengan antarmuka `WebhookQueue`:

| Backend              | Penyimpanan                                                            | Dipakai saat                                                 |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `MemoryWebhookQueue` | Array terurut untuk yang terjadwal, Map untuk yang sedang di-lease     | `REDIS_URL` kosong, atau Redis tidak terjangkau saat startup |
| `RedisWebhookQueue`  | Dua sorted set: `idnpay:webhooks:delayed` dan `idnpay:webhooks:leased` | `REDIS_URL` diisi dan Redis bisa dihubungi                   |

### Lease

- `enqueue` menyimpan job di `delayed`, dengan skor waktu eksekusi.
- `claimDue` memindahkan job yang sudah waktunya ke `leased`. Skornya batas lease, dan job dapat token UUID unik.
- `ack(token)` menghapus job dari `leased`.
- `recoverExpired` memindahkan job dari `leased` kembali ke `delayed` kalau lease-nya sudah habis.

Pemindahan antar-set di Redis dilakukan lewat skrip Lua, jadi `ZREM` dan `ZADD` berjalan dalam satu langkah. Job tidak pernah berada di antara dua set. Kalau dua worker mengejar job yang sama, hanya satu yang `ZREM`-nya mengembalikan 1.

Token berbeda untuk setiap klaim. Karena itu, worker yang lease-nya sudah habis tidak bisa menghapus klaim worker lain dengan `ack`.

### Worker

`WebhookWorker` jalan tiap `WEBHOOK_TICK_MS`. Setiap tick:

1. Pulihkan job yang lease-nya habis.
2. Klaim sampai 20 job yang sudah waktunya. Lease-nya `WEBHOOK_TIMEOUT_MS + 5000 ms`.
3. Kirim semua job itu secara paralel. Hasilnya menentukan apakah job di-ack, dijadwalkan ulang, atau dibiarkan sampai lease habis.

Tick berikutnya tidak jalan kalau tick sebelumnya belum selesai.

## Penyimpanan transaksi

`TransactionStore` menyimpan transaksi di memori dengan batas `TRANSACTION_STORE_LIMIT`. Kalau sudah penuh, transaksi selesai yang paling lama dihapus, dan `order_id`-nya ikut dilepas. Transaksi `PENDING` tidak pernah dihapus.

Penyimpanan ini memang tidak persisten. Ini alat uji, bukan database.

## Penyapu kedaluwarsa

Tiap detik, `expireDueTransactions` mencari transaksi `PENDING` yang sudah lewat `expires_at`, lalu mengubahnya jadi `EXPIRED`. Penyapu tidak akan jalan bersamaan dengan dirinya sendiri.

`GET /v1/transactions/:id` juga memeriksa kedaluwarsa, jadi klien tidak akan melihat status yang basi.

## Kalau ada yang gagal

| Kejadian                                | Dampak                                          | Yang terjadi                                                                                                                        |
| --------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Redis tidak bisa dihubungi saat startup | Antrean pakai memori                            | Ada peringatan di log. Aplikasi tetap jalan.                                                                                        |
| Redis putus saat aplikasi jalan         | Pembayaran, kegagalan, dan kedaluwarsa tertunda | Aksi yang butuh antrean dibalas `503 QUEUE_UNAVAILABLE` dan status tidak berubah. Setelah Redis hidup lagi, koneksi pulih otomatis. |
| Proses mati saat job sedang dikirim     | Job tertahan di `leased`                        | Dipulihkan setelah lease habis (hanya Redis).                                                                                       |
| Aplikasi kamu lambat atau mati          | Pengiriman gagal                                | Retry dengan backoff. Setelah batas retry, job dibuang dan dicatat di log.                                                          |
| Penjadwalan ulang webhook gagal         | Job belum selesai                               | Job tidak di-ack, jadi dipulihkan setelah lease habis.                                                                              |
| Kapasitas transaksi penuh               | Charge baru ditolak                             | `503 STORE_FULL`, kalau tidak ada transaksi selesai yang bisa dihapus.                                                              |

## Batasan

- Transaksi tidak tersimpan permanen. Restart berarti semua transaksi hilang.
- Antrean memori juga hilang saat restart.
- Transaksi lama yang sudah dihapus dari penyimpanan akan dibalas `404` saat di-GET.
- Penyimpanan transaksi tidak dibagi antar instance. Beberapa instance bisa berbagi antrean Redis, tapi setiap transaksi hanya dikenal oleh instance yang membuatnya.
- Simulator tidak memeriksa apakah `callback_url` aman. Jangan jalankan simulator di jaringan yang tidak dipercaya kalau ada yang bisa mengisi `callback_url` ke layanan internal.
