# Keamanan

## Lingkup

idnpay-sandbox adalah alat untuk development dan testing. Simulator ini tidak memproses uang sungguhan dan tidak terhubung ke bank atau penyedia e-Wallet.

Meski begitu, laporan keamanan tetap penting kalau berdampak ke orang yang memakai simulator, misalnya:

- Bypass autentikasi `X-Client-Key`
- Pemalsuan atau lolosnya verifikasi signature webhook
- `SECRET_KEY` atau `CLIENT_KEY` bocor lewat log, respons, atau dashboard
- Injeksi atau eksekusi kode lewat input yang diterima simulator
- Kerentanan di dependensi yang dipakai langsung

## Cara melaporkan

Jangan buka issue publik untuk kerentanan. Laporkan lewat [Security Advisories](https://github.com/Reyhandhani/idnpay-sandbox/security/advisories/new) di repositori ini supaya laporannya privat.

Sertakan:

- Versi atau commit yang kamu uji
- Langkah untuk mereproduksi
- Dampak yang kamu perkirakan

Ini proyek sukarela, jadi balasan bisa butuh beberapa hari. Setelah diperbaiki, kami akan mencantumkan nama pelapor di catatan rilis, kalau kamu setuju.

## Praktik aman

- Ganti `CLIENT_KEY` dan `SECRET_KEY` sebelum simulator diakses orang lain.
- Jangan membuka port simulator ke internet tanpa lapisan autentikasi tambahan.
- Simulator akan mengirim HTTP POST ke setiap `callback_url` yang diberikan. Jalankan di jaringan yang kamu percaya.
