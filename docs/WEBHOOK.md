# Webhooks

Whenever a transaction changes state, the simulator sends a `POST` to the `callback_url` you set on the charge.

## When a webhook is sent

A webhook is scheduled when a transaction leaves `PENDING`:

- `PAID`, through `POST /v1/simulate/pay`
- `FAILED`, through `POST /v1/simulate/fail`
- `EXPIRED`, through `POST /v1/simulate/expire`, or automatically when `expires_at` passes

`PENDING` transactions do not send webhooks.

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

| Field                | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| `status_code`        | Status code from the table in the [README](../README.md) |
| `transaction_id`     | Transaction id in the simulator                          |
| `order_id`           | `order_id` you sent with the charge                      |
| `gross_amount`       | Amount in rupiah, as an integer                          |
| `payment_type`       | `qris`, `bank_transfer`, or `ewallet`                    |
| `transaction_status` | `PAID`, `FAILED`, or `EXPIRED`                           |
| `transaction_time`   | Time of the state change, in WIB                         |

`X-IDNPay-Timestamp` is the send time in Unix seconds. It changes on every attempt, including retries.

## Verifying the signature

The signature is HMAC-SHA256 with `SECRET_KEY` as the key. The signed message is three values joined without separators:

```text
message   = order_id + status_code + gross_amount
signature = hex(HMAC-SHA256(key = SECRET_KEY, message = message))
```

For the example above, the message is `ORDER-10293200150000`.

Always verify the signature before processing a webhook, and compare in constant time instead of using `===`.

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

Plain PHP, no framework. In a framework, read the body and header from the framework's request object instead.

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

### What the signature does not cover

The formula covers `order_id`, `status_code`, and `gross_amount` only. That means:

- `transaction_status` and `transaction_time` are not signed. Before changing an order, re-read the transaction with `GET /v1/transactions/:transaction_id`.
- `X-IDNPay-Timestamp` is not signed either. Use it for logging, or for a rough rule such as rejecting requests far from your server's clock.

This matches the signature scheme used by established Indonesian gateways, which also bind the status through `status_code` rather than `transaction_status`.

## What to return

| Your response                                 | What the simulator does                    |
| --------------------------------------------- | ------------------------------------------ |
| `2xx`                                         | Treats it as delivered and drops the job.  |
| Any other status, such as `401`, `500`, `503` | Treats it as failed and schedules a retry. |
| No response within `WEBHOOK_TIMEOUT_MS`       | Treats it as failed and schedules a retry. |
| Connection refused or DNS failure             | Treats it as failed and schedules a retry. |

The response body is ignored. Reply fast, then do heavy work in the background.

## Retries

After the n-th failure, the next attempt is scheduled 2ⁿ × 1000 ms later.

| After failure | Next attempt in |
| ------------- | --------------- |
| 1             | 2 seconds       |
| 2             | 4 seconds       |
| 3             | 8 seconds       |
| 4             | 16 seconds      |
| 5             | 32 seconds      |

The total number of attempts is `1 + WEBHOOK_RETRY_LIMIT`. With the default of `5`, a webhook is tried up to six times. After that the simulator logs an error and stops.

## Delivery guarantees

Delivery is **at-least-once**. Every scheduled webhook is attempted until the retry limit, and your app may receive the same one more than once.

How that works:

1. When a worker claims a job, the job is held as a lease for `WEBHOOK_TIMEOUT_MS + 5000 ms`.
2. The job is removed only after its outcome is recorded: delivered, rescheduled, or given up.
3. If the process dies before step 2, the lease expires and the next live instance puts the job back in the queue. This only works with Redis. With the in-memory queue, the job is lost.

So a duplicate can arrive, for example when your response is slower than the timeout.

### Deduplicate on your side

Use `transaction_id` and `transaction_status` together as the key. If that pair is already processed, return `2xx` without repeating the work.

## Where jobs are stored

| Backend | Used when                                                   | Notes                                                         |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Memory  | `REDIS_URL` is empty, or Redis cannot be reached at startup | Jobs are lost when the process stops                          |
| Redis   | `REDIS_URL` is set and reachable                            | Jobs survive while Redis runs. Instances can share one Redis. |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the implementation details.

## Trying it by hand

1. Run a simple server on another port, for example `8000`.
2. Set `callback_url` to `http://host.docker.internal:8000/...` when the simulator runs in Docker, or `http://localhost:8000/...` when it runs on the host.
3. Return a non-2xx status on the first attempt and watch the retry in the simulator logs. Each attempt is logged with `webhook_id` and `attempt`.
