# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/). Versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [0.1.0] - belum dirilis

Rilis pertama.

### Ditambahkan

- Charge untuk QRIS (payload EMVCo dengan CRC-16), Virtual Account per bank, dan deep-link e-Wallet
- Status `PENDING`, `PAID`, `FAILED`, dan `EXPIRED`, dengan endpoint simulasi dan kedaluwarsa otomatis
- Webhook yang ditandatangani HMAC-SHA256, dengan retry dan backoff eksponensial
- Pengiriman at-least-once dengan lease. Job baru dihapus setelah worker mengonfirmasi hasilnya
- Pemulihan otomatis untuk job yang lease-nya habis (antrean Redis)
- Antrean memori sebagai cadangan kalau Redis tidak tersedia, dan koneksi Redis yang tersambung ulang otomatis
- Batas penyimpanan transaksi lewat `TRANSACTION_STORE_LIMIT`
- Simulasi latensi dan error acak
- Dashboard di browser
- Error code `TRANSACTION_BUSY`, `QUEUE_UNAVAILABLE`, dan `STORE_FULL`
- ESLint, Prettier, dan CI di Node.js 22 dan 24 dengan Redis sungguhan, plus build image Docker
- Gerbang cakupan test: minimal 90% baris dan 85% cabang serta fungsi
- Test konsistensi dashboard dan payload webhook
- Panduan deploy, termasuk alasan simulator tidak cocok dijalankan di serverless
- Dokumentasi API, webhook, konfigurasi, dan arsitektur

### Keamanan

- Webhook dijadwalkan sebelum status berubah. Kalau penjadwalan gagal, status tetap `PENDING`, jadi tidak ada notifikasi yang hilang diam-diam.
- Perbandingan `X-Client-Key` dan signature memakai `timingSafeEqual`.
