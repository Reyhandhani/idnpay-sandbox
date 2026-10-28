# idnpay-sandbox

[![CI](https://github.com/Reyhandhani/idnpay-sandbox/actions/workflows/ci.yml/badge.svg)](https://github.com/Reyhandhani/idnpay-sandbox/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Release](https://img.shields.io/github/v/release/Reyhandhani/idnpay-sandbox?include_prereleases&sort=semver)](https://github.com/Reyhandhani/idnpay-sandbox/releases)

A local payment gateway simulator for Indonesia. Use it to test QRIS, Virtual Account, and e-Wallet flows without a third-party sandbox that goes down or rate limits you.

Webhooks are signed with HMAC-SHA256, so you can test signature verification on your side too.

## Features

- QRIS with an EMVCo payload and CRC-16 checksum
- Virtual Accounts for BCA, Mandiri, BRI, BNI, and Permata
- e-Wallet deeplinks for GoPay, OVO, ShopeePay, and DANA
- Transaction states `PENDING`, `PAID`, `FAILED`, and `EXPIRED`, driven by simulation endpoints
- Signed webhooks with retries and exponential backoff
- Redis queue (optional). Without Redis, the queue runs in memory
- Simulated latency and random failures for resilience testing
- A small browser dashboard for trying flows without writing code

## Quick start

Docker Compose is the easiest path. It builds the image and starts the simulator with Redis.

```bash
docker compose up -d --build
```

Run the same command after pulling changes, otherwise Docker keeps the old image.

Open `http://localhost:9000` for the dashboard.

With Node.js (version 22 or newer):

```bash
npm ci
npm run build
npm start
```

For development with auto-reload, run `npm run dev`. Settings can live in a `.env` file; see `.env.example`.

## First request

Create a QRIS charge:

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

Mark it as paid using the `transaction_id` from the response:

```bash
curl -X POST http://localhost:9000/v1/simulate/pay \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: idnpay-dev-client-key" \
  -d '{ "transaction_id": "trx-..." }'
```

Your `callback_url` then receives a webhook with `transaction_status` set to `PAID`.

## Connecting your app

If the simulator runs in Docker and your app runs on the host, use `host.docker.internal` in `callback_url`. Inside a container, `localhost` points at the container itself, not your machine.

| Your app                | Simulator | `callback_url`                           |
| ----------------------- | --------- | ---------------------------------------- |
| Host                    | Docker    | `http://host.docker.internal:<port>/...` |
| Host                    | Host      | `http://localhost:<port>/...`            |
| Container in same stack | Docker    | `http://<service-name>:<port>/...`       |

## States and payment methods

| `transaction_status` | `status_code` | Meaning             |
| -------------------- | ------------- | ------------------- |
| `PENDING`            | `201`         | Waiting for payment |
| `PAID`               | `200`         | Payment received    |
| `FAILED`             | `202`         | Payment failed      |
| `EXPIRED`            | `407`         | Past `expiry_time`  |

Final states never change again, and every state change sends exactly one webhook.

| `payment_type`  | Extra field                                       | Response field |
| --------------- | ------------------------------------------------- | -------------- |
| `qris`          | –                                                 | `qr_string`    |
| `bank_transfer` | `bank`: `bca`, `mandiri`, `bri`, `bni`, `permata` | `va_number`    |
| `ewallet`       | `ewallet`: `gopay`, `ovo`, `shopeepay`, `dana`    | `deeplink_url` |

Virtual Account numbers start with the prefix used by each bank, so they are easy to recognize. Deeplinks follow each provider's scheme but do not open a real app.

## Documentation

- [API](docs/API.md): endpoints, request and response formats, error codes
- [Webhooks](docs/WEBHOOK.md): payload, signature verification, retries
- [Configuration](docs/CONFIGURATION.md): every environment variable
- [Architecture](docs/ARCHITECTURE.md): how the pieces fit and what happens on failure
- [Deployment](docs/DEPLOYMENT.md): why it needs a container, not serverless
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Development

```bash
npm ci
npm run ci              # format, lint, typecheck, tests with coverage, build
npm test                # tests only
npm run test:coverage   # tests with the coverage gate (90% lines, 85% branches and functions)
```

Redis integration tests only run when `TEST_REDIS_URL` is set:

```bash
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
```

Layout:

```text
src/
  config/       configuration and constants
  controllers/  request handlers
  plugins/      auth, network simulation, error handling
  queues/       webhook queue (memory and Redis) and worker
  routes/       endpoints and validation schemas
  services/     transaction state, payment details, webhooks, QRIS
  app.ts        application wiring
  index.ts      process entry point
public/         dashboard
test/           unit and integration tests
```

## Security

This is a development tool, not a production service. Change `CLIENT_KEY` and `SECRET_KEY` before exposing it to anyone else. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
