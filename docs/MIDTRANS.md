# Midtrans-compatible API

The simulator exposes a subset of the Midtrans Core API under `/v2`, so a project already written for Midtrans can point its base URL here and keep the same request and webhook shapes.

## Switching over

| Setting           | Midtrans                                      | Here                                      |
| ----------------- | --------------------------------------------- | ----------------------------------------- |
| Base URL          | `https://api.sandbox.midtrans.com`            | `http://localhost:9000`                   |
| Auth              | Basic, server key as username, empty password | Same, with `SECRET_KEY` as the server key |
| Webhook signature | `signature_key` in the body, SHA512           | Same                                      |

Keep your request bodies. The only addition is `callback_url`, because Midtrans reads the notification URL from its dashboard and this tool has no dashboard.

## Supported endpoints

`POST /v2/charge`

```json
{
  "transaction_details": { "order_id": "ORDER-1", "gross_amount": 150000 },
  "payment_type": "bank_transfer",
  "bank_transfer": { "bank": "bca" },
  "callback_url": "http://localhost:8000/webhook"
}
```

`GET /v2/{order_id}/status`

Both return the Midtrans field names: `status_code`, `transaction_status`, `fraud_status`, `gross_amount` as a string with two decimals, plus `va_numbers`, `qr_string`, or `deeplink_url`.

## Payment types

| `payment_type`                            | Maps to                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `qris`                                    | QRIS payload with CRC-16                                         |
| `bank_transfer` with `bank_transfer.bank` | Virtual Account, banks `bca`, `mandiri`, `bri`, `bni`, `permata` |
| `echannel`                                | Mandiri Virtual Account                                          |
| `gopay`, `ovo`, `shopeepay`, `dana`       | e-Wallet deeplink                                                |

Anything else, including `credit_card`, returns `400`.

## Status names

| Internal  | Midtrans     |
| --------- | ------------ |
| `PENDING` | `pending`    |
| `PAID`    | `settlement` |
| `FAILED`  | `deny`       |
| `EXPIRED` | `expire`     |

## Webhooks

Transactions created through `/v2` send a Midtrans-shaped body:

```json
{
  "transaction_time": "2026-10-28 14:00:00",
  "transaction_status": "settlement",
  "transaction_id": "trx-...",
  "status_message": "midtrans payment notification",
  "status_code": "200",
  "signature_key": "9f2c...",
  "payment_type": "qris",
  "order_id": "ORDER-1",
  "gross_amount": "150000.00",
  "fraud_status": "accept",
  "currency": "IDR"
}
```

Verify it the way Midtrans documents:

```js
const crypto = require("node:crypto");

const expected = crypto
  .createHash("sha512")
  .update(`${order_id}${status_code}${gross_amount}${SERVER_KEY}`)
  .digest("hex");

const valid = expected === signature_key;
```

No `X-IDNPay-Signature` header is sent for these webhooks. Transactions created through `/v1` keep the HMAC header scheme.

## Idempotency

Both `/v1/charge` and `/v2/charge` accept an `Idempotency-Key` header. Repeating a request with the same key returns the transaction created the first time, so a retried CI job does not create a second charge.

## Triggering payment

Midtrans has no endpoint for "mark this paid", because a human pays. Here you drive it:

```bash
curl -X POST http://localhost:9000/v1/simulate/pay \
  -H "X-Client-Key: idnpay-dev-client-key" \
  -H "Content-Type: application/json" \
  -d '{ "transaction_id": "trx-..." }'
```

Simulation endpoints stay on `/v1` with `X-Client-Key`, so they cannot be called by accident from production code written for Midtrans.

## Not supported

Snap, cards, 3-D Secure, refunds, subscriptions, payouts, and Iris. Requesting an unsupported payment type fails loudly instead of returning a plausible response.
