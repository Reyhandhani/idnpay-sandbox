# Deploy

Simulator ini butuh proses yang hidup terus, bukan serverless. Alasannya ada di bagian pertama. Kalau kamu hanya ingin mencoba di laptop, cukup `docker compose up -d` dan tidak perlu membaca sisanya.

## Kenapa bukan serverless (Vercel, Netlify Functions, dan sejenisnya)

Simulator menyimpan transaksi di memori proses, menjalankan dua timer di background (penyapu kedaluwarsa tiap detik dan worker webhook), dan mengandalkan proses yang sama untuk memegang lease antrean. Serverless memanggil fungsi per request lalu mematikannya, jadi:

- Transaksi hilang di antara request.
- Timer tidak pernah jalan, sehingga transaksi tidak pernah `EXPIRED` dan webhook tidak pernah terkirim.
- Retry berbackoff tidak bisa diandalkan karena tidak ada proses yang menunggu.

Vercel sendiri tidak menyediakan Redis. Kamu bisa menambahkan Redis dari penyedia lain lewat marketplace, tapi dua masalah pertama tetap ada: status transaksi dan timer tidak bertahan di antara invokasi. Paket Hobby juga dibatasi untuk penggunaan non-komersial.

## Yang cocok

Apa pun yang bisa menjalankan container dan membiarkannya hidup:

- VPS kecil dengan Docker Compose. Ini yang paling sederhana, dan `docker-compose.yml` di repositori sudah siap.
- Platform container seperti Fly.io, Railway, Render, atau Koyeb. Pilih paket yang tidak mematikan instance saat idle.
- Kubernetes, kalau kamu memang sudah punya.

Kalau butuh lebih dari satu instance, isi `REDIS_URL` supaya antrean webhook dibagi. Penyimpanan transaksi tetap per-instance, jadi arahkan klien ke instance yang sama (misalnya lewat sticky session) atau jalankan satu instance saja.

## Langkah di VPS

```bash
git clone https://github.com/Reyhandhani/idnpay-sandbox.git
cd idnpay-sandbox
cp .env.example .env
# Edit .env: ganti CLIENT_KEY dan SECRET_KEY.
docker compose up -d --build
```

Cek dengan `curl http://localhost:9000/health`. Untuk HTTPS, taruh reverse proxy (Caddy atau Nginx) di depannya.

## Sebelum dibuka ke publik

Ini alat uji yang bisa mengirim HTTP POST ke alamat apa pun yang diberikan klien. Kalau dibuka ke internet:

- Ganti `CLIENT_KEY` dan `SECRET_KEY`. Nilai bawaan tertulis di dokumentasi.
- Jangan taruh simulator di jaringan yang sama dengan layanan internal yang sensitif. `callback_url` bisa diarahkan ke alamat internal.
- Pasang autentikasi tambahan di reverse proxy kalau hanya kamu yang boleh memakainya.
- Matikan dashboard (`DASHBOARD_ENABLED=false`) kalau tidak perlu diakses publik. Dashboard tidak punya autentikasi sendiri selain `X-Client-Key` yang kamu isi manual.
- Batasi `TRANSACTION_STORE_LIMIT` sesuai memori yang tersedia.

## Kalau hanya butuh diakses dari luar saat development

Pakai tunnel, jangan deploy: `cloudflared tunnel --url http://localhost:9000` atau `ngrok http 9000`. Simulator tetap jalan di laptop, dan tidak ada data uji yang tertinggal di server.
