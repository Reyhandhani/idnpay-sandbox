# idnpay-sandbox

[![CI](https://github.com/Reyhandhani/idnpay-sandbox/actions/workflows/ci.yml/badge.svg)](https://github.com/Reyhandhani/idnpay-sandbox/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Simulator payment gateway untuk lokal. Cocok kalau kamu mau mengetes integrasi QRIS, Virtual Account, atau e-Wallet tanpa sandbox pihak ketiga yang kadang down atau kena rate limit.

Simulator ini mengirim webhook yang sudah ditandatangani HMAC-SHA256, jadi kamu bisa sekalian mengetes verifikasi signature di aplikasi.

## Fitur

- QRIS dengan payload EMVCo dan checksum CRC-16
- Virtual Account untuk BCA, Mandiri, BRI, BNI, dan Permata
- Deep-link e-Wallet untuk GoPay, OVO, ShopeePay, dan DANA
- Status transaksi `PENDING`, `PAID`, `FAILED`, dan `EXPIRED`, yang bisa kamu ubah lewat endpoint simulasi
- Webhook dengan retry dan backoff eksponensial
- Antrean Redis (opsional). Tanpa Redis, antrean memakai memori
- Simulasi latensi dan error acak untuk menguji ketahanan aplikasi
- Dashboard sederhana di browser untuk mencoba alur tanpa menulis kode

## Mulai cepat

Cara termudah pakai Docker Compose. Redis ikut jalan otomatis.

```bash
docker compose up -d
```

Buka `http://localhost:9000` untuk dashboard.

Kalau mau langsung pakai Node.js (butuh Node 22 atau lebih baru):

```bash
npm ci
npm run build
npm start
```

Untuk development dengan auto-reload, pakai `npm run dev`. Konfigurasi bisa ditaruh di file `.env`, contohnya ada di `.env.example`.

## Contoh pemakaian

Buat transaksi QRIS:

```bash
curl -X POST http://localhost:9000/v1/charge \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: idnpay-dev-client-key" \
  -d '{
    "order_id": "ORDER-10293",
    "gross_amount": 150000,
    "payment_type": "qris",
    "callback_url": "http://host.docker.internal:8000/api/payments/webhook"
  }'
```

Simulasikan pembayaran berhasil pakai `transaction_id` dari respons tadi:

```bash
curl -X POST http://localhost:9000/v1/simulate/pay \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: idnpay-dev-client-key" \
  -d '{ "transaction_id": "trx-..." }'
```

Setelah itu, `callback_url` akan menerima webhook dengan `transaction_status` `PAID`.

## Menghubungkan aplikasi

Kalau simulator jalan di Docker tapi aplikasimu jalan di host, pakai `host.docker.internal` sebagai host di `callback_url`. Dari dalam container, `localhost` itu mengarah ke container sendiri, bukan ke mesin kamu.

| Aplikasi                       | Simulator | `callback_url`                           |
| ------------------------------ | --------- | ---------------------------------------- |
| Host                           | Docker    | `http://host.docker.internal:<port>/...` |
| Host                           | Host      | `http://localhost:<port>/...`            |
| Container di Compose yang sama | Docker    | `http://<nama-service>:<port>/...`       |

## Status dan metode pembayaran

| `transaction_status` | `status_code` | Keterangan          |
| -------------------- | ------------- | ------------------- |
| `PENDING`            | `201`         | Menunggu pembayaran |
| `PAID`               | `200`         | Sudah dibayar       |
| `FAILED`             | `202`         | Gagal               |
| `EXPIRED`            | `407`         | Lewat `expiry_time` |

Status yang sudah final (`PAID`, `FAILED`, `EXPIRED`) tidak bisa berubah lagi. Setiap perubahan status mengirim tepat satu webhook.

| `payment_type`  | Field tambahan                                    | Field respons  |
| --------------- | ------------------------------------------------- | -------------- |
| `qris`          | -                                                 | `qr_string`    |
| `bank_transfer` | `bank`: `bca`, `mandiri`, `bri`, `bni`, `permata` | `va_number`    |
| `ewallet`       | `ewallet`: `gopay`, `ovo`, `shopeepay`, `dana`    | `deeplink_url` |

Nomor VA memakai awalan khas tiap bank supaya gampang dikenali. Deep-link e-Wallet mengikuti skema tiap penyedia, tapi tidak terhubung ke aplikasi sungguhan.

## Dokumentasi

- [API](docs/API.md): endpoint, format request dan respons, serta daftar error
- [Webhook](docs/WEBHOOK.md): format, cara verifikasi signature, dan retry
- [Konfigurasi](docs/CONFIGURATION.md): semua variabel lingkungan
- [Arsitektur](docs/ARCHITECTURE.md): cara komponennya bekerja dan apa yang terjadi saat ada kegagalan
- [Kontribusi](CONTRIBUTING.md): cara menyiapkan lingkungan dan mengirim perubahan
- [Kode etik](CODE_OF_CONDUCT.md)
- [Keamanan](SECURITY.md): cara melaporkan kerentanan
- [Changelog](CHANGELOG.md)

## Development

```bash
npm ci
npm run ci        # format, lint, typecheck, test, build
npm test          # hanya test
```

Test integrasi Redis hanya jalan kalau `TEST_REDIS_URL` diisi:

```bash
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
```

Struktur folder:

```text
src/
  config/       konfigurasi dan konstanta
  controllers/  handler request
  plugins/      autentikasi, simulasi jaringan, penanganan error
  queues/       antrean webhook (memori dan Redis) dan worker
  routes/       endpoint dan skema validasi
  services/     logika status, pembayaran, webhook, dan QRIS
  app.ts        perakitan aplikasi
  index.ts      titik masuk
public/         dashboard
test/           test unit dan integrasi
```

## Keamanan

Simulator ini untuk development dan testing, bukan untuk production. Sebelum membuka port ke jaringan lain, ganti `CLIENT_KEY` dan `SECRET_KEY`. Detailnya ada di [SECURITY.md](SECURITY.md).

## Lisensi

MIT. Lihat [LICENSE](LICENSE).
