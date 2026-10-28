# Configuration

Everything is configured through environment variables. An invalid value stops the process at startup, and the error names the variable.

A full example lives in [`.env.example`](../.env.example).

## Server

| Variable            | Default   | Description                                                     |
| ------------------- | --------- | --------------------------------------------------------------- |
| `HOST`              | `0.0.0.0` | Address to bind                                                 |
| `PORT`              | `9000`    | HTTP port, 1 to 65535                                           |
| `LOG_LEVEL`         | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `DASHBOARD_ENABLED` | `true`    | Set to `false` to stop serving the dashboard at `/`             |

## Authentication

| Variable     | Default                 | Description                                 |
| ------------ | ----------------------- | ------------------------------------------- |
| `CLIENT_KEY` | `idnpay-dev-client-key` | Value expected in the `X-Client-Key` header |
| `SECRET_KEY` | `idnpay-dev-secret-key` | Signing key for webhooks                    |

If either value is still the default, the simulator logs a warning at startup. Change both before anyone else can reach it.

## Transactions

| Variable                  | Default       | Description                                                     |
| ------------------------- | ------------- | --------------------------------------------------------------- |
| `CHARGE_EXPIRY_MINUTES`   | `60`          | How long a transaction stays `PENDING`, in minutes (1 to 10080) |
| `MERCHANT_NAME`           | `IDNPAY MOCK` | Merchant name in the QRIS payload, truncated to 25 characters   |
| `MERCHANT_CITY`           | `JAKARTA`     | Merchant city in the QRIS payload, truncated to 15 characters   |
| `TRANSACTION_STORE_LIMIT` | `10000`       | Maximum transactions kept in memory (10 to 1000000)             |

When the store is full, the oldest finished transaction is evicted first. `PENDING` transactions are never evicted. If every stored transaction is still `PENDING`, new charges fail with `503 STORE_FULL`.

## Webhooks

| Variable              | Default | Description                                         |
| --------------------- | ------- | --------------------------------------------------- |
| `WEBHOOK_RETRY_LIMIT` | `5`     | Retries after the first failed attempt (0 to 10)    |
| `WEBHOOK_TIMEOUT_MS`  | `5000`  | Timeout for one webhook request (100 to 60000)      |
| `WEBHOOK_TICK_MS`     | `500`   | How often the worker checks the queue (10 to 60000) |

See [WEBHOOK.md](WEBHOOK.md) for delivery behavior.

## Queue

| Variable    | Default | Description                                                                   |
| ----------- | ------- | ----------------------------------------------------------------------------- |
| `REDIS_URL` | empty   | For example `redis://localhost:6379`. Leave empty to use the in-memory queue. |

If Redis cannot be reached at startup, the simulator falls back to the in-memory queue and logs a warning. If Redis drops while running, actions that need to schedule a webhook return `503 QUEUE_UNAVAILABLE` until the connection recovers. Transaction state is not changed in that case.

## Network simulation

| Variable                   | Default | Description                                         |
| -------------------------- | ------- | --------------------------------------------------- |
| `SIMULATED_LATENCY_MS`     | `0`     | Extra delay on every `/v1` request (0 to 60000)     |
| `SIMULATED_FAILURE_RATE`   | `0`     | Chance an `/v1` request fails (0 to 1)              |
| `SIMULATED_FAILURE_STATUS` | `503`   | Status returned by a simulated failure (400 to 599) |

`/health` and the dashboard are not affected.
