# Kontribusi

Terima kasih sudah tertarik membantu. Panduan ini menjelaskan cara menyiapkan lingkungan, menjalankan pemeriksaan, dan mengirim perubahan.

Partisipasi di proyek ini mengikuti [Kode etik](CODE_OF_CONDUCT.md).

## Menyiapkan lingkungan

Butuh Node.js 22 atau lebih baru.

```bash
git clone https://github.com/Reyhandhani/idnpay-sandbox.git
cd idnpay-sandbox
npm ci
npm run ci
```

`npm run ci` menjalankan format, lint, typecheck, test, dan build. Pastikan ini lolos sebelum membuka PR.

Untuk test integrasi Redis, jalankan Redis lokal lalu isi `TEST_REDIS_URL`:

```bash
docker run -d --name redis-test -p 6379:6379 redis:7-alpine
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
```

## Alur kerja

1. Untuk perubahan besar, atau yang menyentuh API atau format webhook, buka issue dulu supaya bisa didiskusikan.
2. Buat branch dari `main`. Beri nama yang jelas, misalnya `fix/redis-reconnect`.
3. Tulis perubahannya beserta test. Untuk bug, buat test yang gagal dulu sebelum memperbaikinya.
4. Kalau perilaku yang terlihat dari luar berubah, update `docs/` dan `README.md`. Tambahkan juga catatan di `CHANGELOG.md`.
5. Buka PR. Jelaskan alasannya, bukan cuma apa yang berubah.

## Konvensi

- Nama identifier dan komentar teknis pakai Bahasa Inggris. Pesan untuk klien (`status_message`), log, dan dokumentasi pakai Bahasa Indonesia.
- Komentar hanya untuk hal yang tidak kelihatan dari kodenya sendiri, misalnya alasan urutan operasi tertentu.
- Error pakai `AppError` dengan kode yang konsisten. Kode baru ditambahkan di `src/errors.ts` dan dicatat di `docs/API.md`.
- Variabel environment baru harus masuk ke `src/config/env.ts`, diuji di `test/config.test.ts`, dan dicatat di `docs/CONFIGURATION.md` serta `.env.example`.
- Jangan pakai library kriptografi pihak ketiga. Cukup modul `crypto` bawaan Node.js.

## Test

- Setiap perubahan perilaku perlu test.
- `npm run test:coverage` dipakai di CI dan akan gagal kalau cakupan turun di bawah 90% baris atau 85% cabang dan fungsi.
- Test ada di `test/`. Helper bersama ada di `test/helpers.ts` dan `test/support/`.
- Untuk logika yang bergantung waktu, pakai `manualClock` dari `test/helpers.ts`. Hindari `setTimeout` yang panjang di test.

## Pull request

CI akan menjalankan semua pemeriksaan di Node.js 22 dan 24, dengan Redis sungguhan, dan membangun image Docker. Tunggu sampai semuanya hijau sebelum minta review.
