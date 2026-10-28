# API

Every endpoint under `/v1` takes JSON and requires an `X-Client-Key` header that matches `CLIENT_KEY`.

## Endpoints

| Method | Path                               | Description                       |
| ------ | ---------------------------------- | --------------------------------- |
| POST   | `/v1/charge`                       | Create a transaction in `PENDING` |
| GET    | `/v1/transactions`                 | List transactions, newest first   |
| GET    | `/v1/transactions/:transaction_id` | Read one transaction              |
| POST   | `/v1/simulate/pay`                 | Move the transaction to `PAID`    |
| POST   | `/v1/simulate/fail`                | Move the transaction to `FAILED`  |
| POST   | `/v1/simulate/expire`              | Move the transaction to `EXPIRED` |
| GET    | `/health`                          | Health check, no authentication   |

## Error format

All errors share one shape:

```json
{
  "status_code": "409",
  "status_message": "order_id ORDER-10293 is already in use.",
  "error_code": "DUPLICATE_ORDER_ID"
}
```

Validation errors (`VALIDATION_ERROR`) also include `details`, naming each field that failed:

```json
{
  "status_code": "400",
  "status_message": "Request validation failed. Check the fields listed in details.",
  "error_code": "VALIDATION_ERROR",
  "details": [{ "field": "payment_type", "rule": "required" }]
}
```

## POST /v1/charge

Creates a transaction.

### Body

| Field          | Type    | Required             | Rules                                                                            |
| -------------- | ------- | -------------------- | -------------------------------------------------------------------------------- |
| `order_id`     | string  | yes                  | 1–50 chars, letters, digits, `.`, `_`, `-`. Must not match a stored transaction. |
| `gross_amount` | integer | yes                  | Rupiah, 1 to 100000000                                                           |
| `payment_type` | string  | yes                  | `qris`, `bank_transfer`, or `ewallet`                                            |
| `callback_url` | string  | yes                  | `http` or `https` URL, up to 2048 characters                                     |
| `bank`         | string  | with `bank_transfer` | `bca`, `mandiri`, `bri`, `bni`, or `permata`                                     |
| `ewallet`      | string  | with `ewallet`       | `gopay`, `ovo`, `shopeepay`, or `dana`                                           |

Unknown fields are rejected with `400`. That is deliberate: a typo in a field name should fail loudly instead of being ignored.

### Response `201`

QRIS example:

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

Extra fields by `payment_type`:

- `qris`: `qr_string`
- `bank_transfer`: `bank`, `va_number`
- `ewallet`: `provider`, `deeplink_url`

`expiry_time` is Western Indonesia Time (UTC+7), formatted `YYYY-MM-DD HH:mm:ss`.

## GET /v1/transactions/:transaction_id

Returns the current state. If a `PENDING` transaction is past `expiry_time`, it is marked `EXPIRED` before the response is sent.

The body matches `POST /v1/charge`.

## GET /v1/transactions

| Query   | Type    | Default | Rules    |
| ------- | ------- | ------- | -------- |
| `limit` | integer | 50      | 1 to 200 |

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

`total` counts every stored transaction, not just the page.

## POST /v1/simulate/pay, /fail, /expire

All three take the same body:

```json
{ "transaction_id": "trx-6f1c2a9e-4b7d-4c2a-9f3e-2d8b1a7c5e90" }
```

| Endpoint              | Resulting state | `status_code` |
| --------------------- | --------------- | ------------- |
| `/v1/simulate/pay`    | `PAID`          | `200`         |
| `/v1/simulate/fail`   | `FAILED`        | `202`         |
| `/v1/simulate/expire` | `EXPIRED`       | `407`         |

Responses match `GET /v1/transactions/:transaction_id`. Each state change also schedules one webhook; see [WEBHOOK.md](WEBHOOK.md).

These endpoints only work on `PENDING` transactions. Once a transaction is final you get `409 INVALID_TRANSACTION_STATE`.

## GET /health

```json
{ "status": "ok" }
```

## Error codes

| HTTP | `error_code`                 | Cause                                                                                                       |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`           | Invalid body, missing required field, or invalid field combination                                          |
| 400  | `BAD_REQUEST`                | Body is not valid JSON                                                                                      |
| 401  | `UNAUTHORIZED`               | `X-Client-Key` missing or wrong                                                                             |
| 404  | `TRANSACTION_NOT_FOUND`      | Unknown `transaction_id`                                                                                    |
| 404  | `NOT_FOUND`                  | Unknown path                                                                                                |
| 409  | `DUPLICATE_ORDER_ID`         | `order_id` still used by a stored transaction                                                               |
| 409  | `INVALID_TRANSACTION_STATE`  | Transaction is already final                                                                                |
| 409  | `TRANSACTION_BUSY`           | Another request is changing the same transaction. Retry shortly.                                            |
| 500  | `INTERNAL_ERROR`             | Unexpected error. Check the simulator logs.                                                                 |
| 503  | `QUEUE_UNAVAILABLE`          | The webhook could not be scheduled, usually because Redis is down. State is unchanged, so retrying is safe. |
| 503  | `STORE_FULL`                 | Store is full and no finished transaction can be evicted                                                    |
| 503  | `SIMULATED_UPSTREAM_FAILURE` | Random failure from `SIMULATED_FAILURE_RATE`                                                                |
