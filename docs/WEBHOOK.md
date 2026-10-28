# Webhook

Setiap kali status transaksi berubah, simulator mengirim `POST` ke `callback_url` yang kamu isi saat charge.

## Kapan webhook dikirim

Webhook dikirim saat transaksi pindah dari `PENDING` ke salah satu status berikut:

- `PAID`, lewat `POST /v1/simulate/pay`
- `FAILED`, lewat `POST /v1/simulate/fail`
- `EXPIRED`, lewat `POST /v1/simulate/expire`, atau otomatis saat `expires_at` lewat

Transaksi yang masih `PENDING` tidak mengirim webhook.

## Request

```http
POST <callback_url>
Content-Type: application/json
User-Agent: idnpay-sandbox/0.1
X-IDNPay-Signature: 3f9c1e...a7b2
X-IDNPay-Timestamp: 1793124676
```

```json
{
  "status_code": "200",
  "transaction_id": "trx-6f1c2a9e-4b7d-4c2a-9f3e-2d8b1a7c5e90",
  "order_id": "ORDER-10293",
  "gross_amount": 150000,
  "payment_type": "qris",
  "transaction_status": "PAID",
  "transaction_time": "2026-10-28 12:15:03"
}
```

| Field                | Isi                                                |
| -------------------- | -------------------------------------------------- |
| `status_code`        | Kode status, lihat tabel di [README](../README.md) |
| `transaction_id`     | ID transaksi di simulator                          |
| `order_id`           | `order_id` yang kamu kirim saat charge             |
| `gross_amount`       | Nominal dalam rupiah, berupa angka bulat           |
| `payment_type`       | `qris`, `bank_transfer`, atau `ewallet`            |
| `transaction_status` | `PAID`, `FAILED`, atau `EXPIRED`                   |
| `transaction_time`   | Waktu perubahan status, dalam WIB                  |

`X-IDNPay-Timestamp` berisi waktu kirim dalam detik Unix. Nilainya ikut berubah setiap kali request di-retry.

## Verifikasi signature

Signature dibuat dengan HMAC-SHA256 pakai `SECRET_KEY` sebagai kunci. Pesannya adalah tiga nilai yang digabung tanpa pemisah:

```text
pesan     = order_id + status_code + gross_amount
signature = hex(HMAC-SHA256(key = SECRET_KEY, message = pesan))
```

Contoh di atas menghasilkan pesan `ORDER-10293200150000`.

Selalu verifikasi signature sebelum memproses webhook. Bandingkan pakai fungsi yang constant-time, jangan pakai `===`.

### Node.js

```js
const crypto = require("node:crypto");

function isAuthentic(body, signatureHeader, secretKey) {
  const message = `${body.order_id}${body.status_code}${body.gross_amount}`;
  const expected = crypto.createHmac("sha256", secretKey).update(message).digest("hex");
  const received = Buffer.from(String(signatureHeader ?? ""));
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}
```

### PHP

Contoh ini PHP biasa tanpa framework. Kalau pakai framework, ambil body dan header lewat objek request milik framework.

```php
<?php

$secretKey = getenv('IDNPAY_SECRET_KEY');
$body = json_decode(file_get_contents('php://input'), true);

$message = $body['order_id'] . $body['status_code'] . $body['gross_amount'];
$expected = hash_hmac('sha256', $message, $secretKey);
$received = $_SERVER['HTTP_X_IDNPAY_SIGNATURE'] ?? '';

if (! hash_equals($expected, $received)) {
    http_response_code(401);
    exit;
}
```

### Yang tidak ditandatangani

Formulanya hanya mencakup `order_id`, `status_code`, dan `gross_amount`. Artinya:

- `transaction_status` dan `transaction_time` tidak ikut ditandatangani. Sebelum mengubah status pesanan, cek ulang lewat `GET /v1/transactions/:transaction_id`.
- `X-IDNPay-Timestamp` juga tidak ditandatangani. Pakai untuk logging atau pembatasan kasar saja, misalnya menolak request yang selisih waktunya jauh dari server.

## Respons dari aplikasi kamu

| Respons                                      | Yang dilakukan simulator                     |
| -------------------------------------------- | -------------------------------------------- |
| `2xx`                                        | Dianggap berhasil. Job dihapus dari antrean. |
| Status lain, misalnya `401`, `500`, `503`    | Dianggap gagal. Dijadwalkan ulang.           |
| Tidak ada respons dalam `WEBHOOK_TIMEOUT_MS` | Dianggap gagal. Dijadwalkan ulang.           |
| Koneksi ditolak atau DNS gagal               | Dianggap gagal. Dijadwalkan ulang.           |

Isi body respons tidak dibaca. Balas secepat mungkin, lalu proses hal berat di background.

## Retry

Setelah kegagalan ke-n, percobaan berikutnya dijadwalkan 2ⁿ × 1000 ms kemudian.

| Setelah gagal ke- | Percobaan berikutnya dalam |
| ----------------- | -------------------------- |
| 1                 | 2 detik                    |
| 2                 | 4 detik                    |
| 3                 | 8 detik                    |
| 4                 | 16 detik                   |
| 5                 | 32 detik                   |

Total percobaan maksimal adalah `1 + WEBHOOK_RETRY_LIMIT`. Dengan default `5`, satu webhook dicoba sampai enam kali. Setelah itu simulator mencatat error dan berhenti.

## Jaminan pengiriman

Pengiriman bersifat **at-least-once**. Webhook yang sudah masuk antrean pasti dicoba sampai batas retry, tapi bisa juga diterima lebih dari sekali.

Cara kerjanya:

1. Saat job diambil worker, job disimpan sebagai lease dengan batas waktu `WEBHOOK_TIMEOUT_MS + 5000 ms`.
2. Job baru dihapus setelah hasilnya tercatat: berhasil, dijadwalkan ulang, atau sudah mencapai batas retry.
3. Kalau proses simulator mati sebelum langkah 2, lease akan habis dan job dikembalikan ke antrean oleh instance yang hidup berikutnya. Ini hanya berlaku untuk Redis. Di antrean memori, job yang sedang diproses ikut hilang.

Jadi bisa saja aplikasi kamu menerima webhook yang sama dua kali, misalnya kalau respons kamu telat melewati timeout.

### Dedup di sisi aplikasi

Pakai kombinasi `transaction_id` dan `transaction_status` sebagai kunci. Kalau kunci itu sudah pernah diproses, balas `2xx` saja tanpa mengulang apa pun.

## Penyimpanan antrean

| Backend | Dipakai saat                                                     | Catatan                                                                 |
| ------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Memori  | `REDIS_URL` kosong, atau Redis tidak bisa dihubungi saat startup | Job hilang kalau proses berhenti                                        |
| Redis   | `REDIS_URL` diisi dan bisa dihubungi                             | Job aman selama Redis hidup. Beberapa instance bisa berbagi satu Redis. |

Detail implementasinya ada di [ARCHITECTURE.md](ARCHITECTURE.md).

## Coba manual

1. Jalankan server sederhana di port lain, misalnya `8000`.
2. Isi `callback_url` dengan `http://host.docker.internal:8000/...` kalau simulator di Docker, atau `http://localhost:8000/...` kalau simulator jalan langsung di host.
3. Balas non-2xx di percobaan pertama, lalu lihat retry-nya di log simulator. Setiap percobaan dicatat dengan `webhook_id` dan `attempt`.
