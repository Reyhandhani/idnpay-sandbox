# Distribution and discovery

Working notes, delete once the steps are done. Two audiences matter: engineers searching for a sandbox to use, and answer engines (ChatGPT, Perplexity, Google AI Overviews) that cite pages containing the words people typed.

Order below is by payoff per hour. Nothing here needs paid ads.

## 1. Turn on GitHub Pages

Settings, Pages, Source: GitHub Actions. Then push to `main`; the `Pages` workflow publishes `site/`.

- URL: https://reyhandhani.github.io/idnpay-sandbox/
- In the repo About panel, set Website to that URL. GitHub uses this field for repo search and for the link shown in results.
- If the Pages URL ever changes (custom domain, renamed repo), update `site/index.html` canonical, `site/robots.txt`, `site/sitemap.xml`, and `site/llms.txt`.

After the first deploy, check:

```bash
curl -s https://reyhandhani.github.io/idnpay-sandbox/ | head -20
curl -s https://reyhandhani.github.io/idnpay-sandbox/robots.txt
```

Then add the site to Google Search Console and Bing Webmaster Tools. Submit the sitemap. That is how indexing starts; without it you wait for a crawler to find the link on its own.

## 2. Publish to npm

The name `idnpay-sandbox` was unclaimed when this was written. A package page is indexed, gets cited by answer engines, and `npx` is the shortest install path anyone can copy.

```bash
npm login
npm publish --access public
```

`prepack` builds `dist/` first. Check the result:

```bash
npm view idnpay-sandbox
npx idnpay-sandbox
```

After it is live, add this to the README under "Without Docker" and to the hero of `site/index.html`:

```bash
npx idnpay-sandbox
```

Do it only after publish, so the page never points at a package that does not exist.

## 3. Write about the problem, not the repo

Posts about a repository get ignored. Posts about a problem people already have get read, linked, and quoted by AI answers. One post per problem, full code in the post, one link at the end.

Problems worth a post, in the words people actually type:

- test webhook Midtrans tanpa ngrok
- sandbox Midtrans down, alternatif lokal
- mock QRIS untuk testing lokal
- simulasi Virtual Account BCA di localhost

Draft for Dev.to or Medium, Indonesian:

> **Cara ngetes webhook Midtrans tanpa ngrok dan tanpa sandbox provider**
>
> Dua hal yang bikin kerjaan berhenti waktu ngetes integrasi pembayaran: sandbox provider sedang maintenance, atau webhook nggak pernah sampai karena callback URL harus publik.
>
> Saya bikin `idnpay-sandbox` buat dua masalah itu. Isi tulisan ini cara pakainya, bukan daftar fitur.
>
> **1. Jalankan**
>
> ```bash
> git clone https://github.com/Reyhandhani/idnpay-sandbox.git
> cd idnpay-sandbox
> docker compose up -d --build
> ```
>
> API ada di `localhost:9000`, dashboard di alamat yang sama.
>
> **2. Bikin charge**
>
> ```bash
> curl -X POST http://localhost:9000/v1/charge \
>   -H "Content-Type: application/json" \
>   -H "X-Client-Key: idnpay-dev-client-key" \
>   -d '{"order_id":"ORDER-1","gross_amount":150000,"payment_type":"qris","callback_url":"http://host.docker.internal:8000/api/webhook"}'
> ```
>
> Response berisi `transaction_id` dan `qr_string`.
>
> **3. Tandai lunas**
>
> ```bash
> curl -X POST http://localhost:9000/v1/simulate/pay \
>   -H "Content-Type: application/json" \
>   -H "X-Client-Key: idnpay-dev-client-key" \
>   -d '{"transaction_id":"trx-..."}'
> ```
>
> Webhook masuk ke `callback_url` dengan header `X-IDNPay-Signature`. Verifikasinya HMAC-SHA256 dari `order_id + status_code + gross_amount` pakai `SECRET_KEY`:
>
> ```js
> const { createHmac } = require("node:crypto");
> const expected = createHmac("sha256", secretKey)
>   .update(`${orderId}${statusCode}${grossAmount}`)
>   .digest("hex");
> ```
>
> **4. Ngetes jalur gagal**
>
> Arahkan `callback_url` ke endpoint yang membalas 503, lalu lihat log. Percobaan ulang pakai jeda `2^n` detik sampai `WEBHOOK_RETRY_LIMIT` (default 5). Ini bagian yang nggak bisa Anda dapat dari sandbox provider.
>
> Batasannya: nggak ada uang sungguhan, nomor VA cuma contoh, dan Snap, kartu, refund, payout belum ada.
>
> Repo: https://github.com/Reyhandhani/idnpay-sandbox

Cross-post the same text with a canonical link back to the first post. Do not paste it into five forums in one day.

## 4. Show HN

Do it after the Pages site is live and `docker compose up` works from a clean clone. HN readers open the thing.

Title: `Show HN: Local payment gateway simulator for Indonesian rails (QRIS, VA, e-wallet)`

First comment:

> I test payment integrations for Indonesian rails, and the provider sandbox is shared: it goes down, rate limits, and needs a public URL for webhooks.
>
> This runs as a container. It creates QRIS, Virtual Account, and e-wallet charges, lets you move a transaction to paid, failed, or expired, and sends webhooks signed with HMAC-SHA256 with retries on failure. There is a Midtrans-compatible subset for people migrating an existing integration.
>
> Limits: no real money, VA prefixes are made up, and Snap, cards, refunds, payouts are not implemented.
>
> I am mainly interested in whether the state machine and retry behavior match what people actually test.

## 5. Indonesian communities

One message, in the group's language, with the problem first and the link last. Telegram and Discord groups for Indonesian backend and fintech engineers, plus the weekly thread on r/indonesia.

> Lagi butuh sandbox pembayaran buat testing lokal? Saya bikin simulator open source buat QRIS, VA, dan e-wallet yang jalan di Docker. Webhook-nya ada tanda tangan HMAC dan bisa dipaksa gagal buat ngetes retry. Nggak ada uang sungguhan, ini cuma buat development. Repo: https://github.com/Reyhandhani/idnpay-sandbox

Do not send this to a group you have never posted in. Ask a mod first if the rules are unclear.

## 6. Awesome lists, later

Most lists reject a project with no users, and a rejected PR is wasted effort. Do this after the repo has some stars and at least one outside mention.

Find candidates with GitHub search: `awesome indonesia`, `awesome testing`, `awesome fintech`, `awesome developer tools`. Read the contribution rules, then open one PR with this shape:

> Adds idnpay-sandbox, an offline payment gateway simulator for Indonesian rails (QRIS, Virtual Account, e-wallet) with signed webhooks and retry testing. MIT licensed, runs in Docker or Node.js.

## 7. Measure

Weekly, not daily:

- GitHub, Insights, Traffic: views and referrers. Referrers tell you which post or list works.
- npm downloads, if published.
- Search Console: queries that already reached the site, and impressions without clicks.
- Ask ChatGPT and Perplexity the four queries in section 3. Note whether the project appears.

If a query gets impressions but no clicks, the title and description in the search result are the problem, not the page. If it gets no impressions after a month, there is no link pointing at the page yet.
