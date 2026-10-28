# Konfigurasi

Semua konfigurasi lewat environment variable. Kalau ada nilai yang tidak valid, proses langsung berhenti saat startup dan pesan errornya menyebut nama variabelnya.

Contoh lengkapnya ada di [`.env.example`](../.env.example).

## Server

| Variabel            | Default   | Keterangan                                                        |
| ------------------- | --------- | ----------------------------------------------------------------- |
| `HOST`              | `0.0.0.0` | Alamat yang didengarkan                                           |
| `PORT`              | `9000`    | Port HTTP, 1 sampai 65535                                         |
| `LOG_LEVEL`         | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, atau `silent` |
| `DASHBOARD_ENABLED` | `true`    | Isi `false` untuk mematikan dashboard di `/`                      |

## Autentikasi

| Variabel     | Default                 | Keterangan                         |
| ------------ | ----------------------- | ---------------------------------- |
| `CLIENT_KEY` | `idnpay-dev-client-key` | Nilai untuk header `X-Client-Key`  |
| `SECRET_KEY` | `idnpay-dev-secret-key` | Kunci HMAC untuk signature webhook |

Kalau salah satunya masih pakai nilai default, simulator akan memberi peringatan saat startup. Ganti dulu sebelum simulator bisa diakses orang lain.

## Transaksi

| Variabel                  | Default       | Keterangan                                                     |
| ------------------------- | ------------- | -------------------------------------------------------------- |
| `CHARGE_EXPIRY_MINUTES`   | `60`          | Masa berlaku transaksi `PENDING`, dalam menit (1 sampai 10080) |
| `MERCHANT_NAME`           | `IDNPAY MOCK` | Nama merchant di payload QRIS. Dipotong maksimal 25 karakter.  |
| `MERCHANT_CITY`           | `JAKARTA`     | Kota merchant di payload QRIS. Dipotong maksimal 15 karakter.  |
| `TRANSACTION_STORE_LIMIT` | `10000`       | Jumlah transaksi maksimal di memori (10 sampai 1000000)        |

Kalau penyimpanan penuh, transaksi selesai yang paling lama akan dihapus lebih dulu. Transaksi `PENDING` tidak pernah dihapus. Kalau semua transaksi di penyimpanan masih `PENDING`, charge baru ditolak dengan `503 STORE_FULL`.

## Webhook

| Variabel              | Default | Keterangan                                                 |
| --------------------- | ------- | ---------------------------------------------------------- |
| `WEBHOOK_RETRY_LIMIT` | `5`     | Jumlah retry setelah percobaan pertama gagal (0 sampai 10) |
| `WEBHOOK_TIMEOUT_MS`  | `5000`  | Batas waktu satu request webhook (100 sampai 60000)        |
| `WEBHOOK_TICK_MS`     | `500`   | Seberapa sering worker mengecek antrean (10 sampai 60000)  |

Detail perilaku pengirimannya ada di [WEBHOOK.md](WEBHOOK.md).

## Antrean

| Variabel    | Default | Keterangan                                                              |
| ----------- | ------- | ----------------------------------------------------------------------- |
| `REDIS_URL` | kosong  | Contohnya `redis://localhost:6379`. Kalau kosong, antrean pakai memori. |

Kalau Redis tidak bisa dihubungi saat startup, simulator pakai antrean memori dan mencatat peringatan. Kalau Redis putus setelah simulator jalan, aksi yang perlu menjadwalkan webhook akan dibalas `503 QUEUE_UNAVAILABLE` sampai koneksi pulih.

## Simulasi jaringan

| Variabel                 | Default | Keterangan                                                    |
| ------------------------ | ------- | ------------------------------------------------------------- |
| `SIMULATED_LATENCY_MS`   | `0`     | Delay tambahan untuk setiap request ke `/v1` (0 sampai 60000) |
| `SIMULATED_FAILURE_RATE` | `0`     | Peluang request ke `/v1` gagal dengan `503` (0 sampai 1)      |

`/health` dan dashboard tidak kena simulasi ini.
