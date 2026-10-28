# API

Semua endpoint di bawah `/v1` pakai JSON dan wajib mengirim header `X-Client-Key`. Nilainya harus sama dengan `CLIENT_KEY`.

## Daftar endpoint

| Method | Path                               | Keterangan                                     |
| ------ | ---------------------------------- | ---------------------------------------------- |
| POST   | `/v1/charge`                       | Membuat transaksi baru dengan status `PENDING` |
| GET    | `/v1/transactions`                 | Daftar transaksi, yang terbaru di atas         |
| GET    | `/v1/transactions/:transaction_id` | Status satu transaksi                          |
| POST   | `/v1/simulate/pay`                 | Ubah status menjadi `PAID`                     |
| POST   | `/v1/simulate/fail`                | Ubah status menjadi `FAILED`                   |
| POST   | `/v1/simulate/expire`              | Ubah status menjadi `EXPIRED`                  |
| GET    | `/health`                          | Cek hidup, tanpa autentikasi                   |

## Format error

Semua error punya bentuk yang sama:

```json
{
  "status_code": "409",
  "status_message": "order_id ORDER-10293 sudah pernah digunakan.",
  "error_code": "DUPLICATE_ORDER_ID"
}
```

Khusus error validasi (`VALIDATION_ERROR`), ada tambahan `details` yang menunjukkan field mana yang bermasalah:

```json
{
  "status_code": "400",
  "status_message": "Permintaan tidak valid. Periksa field yang ditandai.",
  "error_code": "VALIDATION_ERROR",
  "details": [{ "field": "payment_type", "rule": "required" }]
}
```

## POST /v1/charge

Membuat transaksi baru.

### Body

| Field          | Tipe    | Wajib                 | Aturan                                                                                                               |
| -------------- | ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `order_id`     | string  | ya                    | 1 sampai 50 karakter, hanya huruf, angka, `.`, `_`, dan `-`. Tidak boleh sama dengan transaksi yang masih tersimpan. |
| `gross_amount` | integer | ya                    | Dalam rupiah, 1 sampai 100000000                                                                                     |
| `payment_type` | string  | ya                    | `qris`, `bank_transfer`, atau `ewallet`                                                                              |
| `callback_url` | string  | ya                    | URL `http` atau `https`, maksimal 2048 karakter                                                                      |
| `bank`         | string  | kalau `bank_transfer` | `bca`, `mandiri`, `bri`, `bni`, atau `permata`                                                                       |
| `ewallet`      | string  | kalau `ewallet`       | `gopay`, `ovo`, `shopeepay`, atau `dana`                                                                             |

Field yang tidak ada di tabel akan ditolak dengan `400`. Ini sengaja, supaya typo di nama field tidak diam-diam diabaikan.

### Respons `201`

Contoh untuk QRIS:

```json
{
  "status_code": "201",
  "transaction_id": "trx-6f1c2a9e-4b7d-4c2a-9f3e-2d8b1a7c5e90",
  "order_id": "ORDER-10293",
  "gross_amount": 150000,
  "payment_type": "qris",
  "transaction_status": "PENDING",
  "expiry_time": "2026-10-28 13:00:00",
  "qr_string": "00020101021226370014ID.CO.QRIS.WWW..."
}
```

Field tambahan sesuai `payment_type`:

- `qris`: `qr_string`
- `bank_transfer`: `bank`, `va_number`
- `ewallet`: `provider`, `deeplink_url`

`expiry_time` memakai WIB (UTC+7) dengan format `YYYY-MM-DD HH:mm:ss`.

## GET /v1/transactions/:transaction_id

Mengembalikan status terbaru. Kalau transaksi masih `PENDING` tapi sudah lewat `expiry_time`, statusnya langsung diubah jadi `EXPIRED` sebelum respons dikirim.

Bentuk responsnya sama dengan `POST /v1/charge`.

## GET /v1/transactions

Query parameter:

| Parameter | Tipe    | Default | Aturan       |
| --------- | ------- | ------- | ------------ |
| `limit`   | integer | 50      | 1 sampai 200 |

```json
{
  "data": [
    {
      "status_code": "200",
      "transaction_id": "trx-6f1c2a9e-4b7d-4c2a-9f3e-2d8b1a7c5e90",
      "order_id": "ORDER-10293",
      "transaction_status": "PAID"
    }
  ],
  "total": 1
}
```

`total` adalah jumlah semua transaksi yang tersimpan, bukan jumlah item di `data`.

## POST /v1/simulate/pay, /fail, /expire

Ketiga endpoint ini menerima body yang sama:

```json
{ "transaction_id": "trx-6f1c2a9e-4b7d-4c2a-9f3e-2d8b1a7c5e90" }
```

| Endpoint              | Status hasil | `status_code` |
| --------------------- | ------------ | ------------- |
| `/v1/simulate/pay`    | `PAID`       | `200`         |
| `/v1/simulate/fail`   | `FAILED`     | `202`         |
| `/v1/simulate/expire` | `EXPIRED`    | `407`         |

Responsnya sama dengan `GET /v1/transactions/:transaction_id`. Setiap perubahan status juga memicu satu webhook, lihat [WEBHOOK.md](WEBHOOK.md).

Endpoint ini hanya bisa dipakai untuk transaksi `PENDING`. Kalau statusnya sudah final, kamu akan dapat `409 INVALID_TRANSACTION_STATE`.

## GET /health

```json
{ "status": "ok" }
```

## Daftar error code

| HTTP | `error_code`                 | Penyebab                                                                                          |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`           | Body tidak valid, ada field wajib yang kosong, atau kombinasi field salah                         |
| 400  | `BAD_REQUEST`                | Body bukan JSON yang valid                                                                        |
| 401  | `UNAUTHORIZED`               | `X-Client-Key` tidak ada atau salah                                                               |
| 404  | `TRANSACTION_NOT_FOUND`      | `transaction_id` tidak ditemukan                                                                  |
| 404  | `NOT_FOUND`                  | Path tidak ada                                                                                    |
| 409  | `DUPLICATE_ORDER_ID`         | `order_id` masih dipakai transaksi yang tersimpan                                                 |
| 409  | `INVALID_TRANSACTION_STATE`  | Status transaksi sudah final                                                                      |
| 409  | `TRANSACTION_BUSY`           | Transaksi yang sama sedang diproses request lain. Coba lagi sebentar.                             |
| 500  | `INTERNAL_ERROR`             | Error tak terduga. Cek log simulator.                                                             |
| 503  | `QUEUE_UNAVAILABLE`          | Webhook gagal dijadwalkan, biasanya karena Redis putus. Status tidak berubah, jadi aman di-retry. |
| 503  | `STORE_FULL`                 | Penyimpanan penuh dan tidak ada transaksi selesai yang bisa dihapus                               |
| 503  | `SIMULATED_UPSTREAM_FAILURE` | Error acak dari `SIMULATED_FAILURE_RATE`                                                          |
