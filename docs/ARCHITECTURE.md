# Architecture

This page covers the internals: the pieces, the order of operations that matter, and what happens when something fails.

## Overview

```text
client ──HTTP /v1──▶ routes → plugins → controllers → services
                                                     │
                                  PaymentService ────┼──▶ TransactionStore (memory)
                                                     │
                                                     └─ enqueue ─▶ WebhookQueue (memory or Redis)
                                                                         │
                        expiry sweeper (every second) ─▶ ...             │ claimDue / ack
                                                                         ▼
                                                                  WebhookWorker ──POST──▶ callback_url
```

Two things run in the background: the expiry sweeper (once a second) and the webhook worker (every `WEBHOOK_TICK_MS`).

| Folder         | Contents                                                             |
| -------------- | -------------------------------------------------------------------- |
| `routes/`      | Endpoint definitions and JSON validation schemas                     |
| `plugins/`     | `X-Client-Key` check, latency and failure simulation, error handling |
| `controllers/` | Turn requests into service calls and build responses                 |
| `services/`    | State rules, QRIS, VA, e-Wallet, and signatures                      |
| `queues/`      | Webhook queue and its worker                                         |

## Transaction states

```text
PENDING ──simulate/pay────▶ PAID
   ├────simulate/fail─────▶ FAILED
   └────simulate/expire───▶ EXPIRED   (also automatic once expires_at passes)
```

`PAID`, `FAILED`, and `EXPIRED` are final. There is no way back.

### Order of a state change

Every change goes through `PaymentService.transition`:

1. Check that the transaction is still `PENDING`. If not, return `409 INVALID_TRANSACTION_STATE`.
2. Mark it as in progress. If another request holds the mark, return `409 TRANSACTION_BUSY`.
3. Build the webhook payload and signature for the target state.
4. Enqueue the webhook.
5. Only then change the state in memory, and release the mark.

That order buys two things:

- If the queue is unavailable, the transaction stays `PENDING`. The caller can retry without losing the notification.
- No webhook is ever scheduled for a state that never happened.

The in-progress mark in step 2 stops two concurrent requests from both passing the state check and sending two webhooks. Node runs on a single thread, so synchronous blocks are safe; the only gap is the `await` on the queue, and the mark closes it.

## Webhook queue

Two implementations share the `WebhookQueue` interface:

| Backend              | Storage                                                                 | Used when                                                |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `MemoryWebhookQueue` | A sorted array for scheduled jobs, a map for leased ones                | `REDIS_URL` is empty, or Redis is unreachable at startup |
| `RedisWebhookQueue`  | Two sorted sets: `idnpay:webhooks:delayed` and `idnpay:webhooks:leased` | `REDIS_URL` is set and reachable                         |

### Leases

- `enqueue` writes a job into `delayed`, scored by execution time.
- `claimDue` moves due jobs into `leased`, scored by the lease deadline, and gives each claim its own UUID token.
- `ack(token)` removes the job from `leased`.
- `recoverExpired` moves jobs back from `leased` to `delayed` once their lease has passed.

In Redis, moving between sets happens inside one Lua script, so `ZREM` and `ZADD` run as a single step. A job is never in between sets. When two workers race for the same job, only one gets `ZREM = 1`.

Tokens are unique per claim, so a worker whose lease expired cannot ack a lease now held by someone else.

### Worker

`WebhookWorker` runs every `WEBHOOK_TICK_MS`. Each tick:

1. Recovers jobs with expired leases.
2. Claims up to 20 due jobs, with a lease of `WEBHOOK_TIMEOUT_MS + 5000 ms`.
3. Delivers them in parallel. The result decides whether each job is acked, rescheduled, or left to expire.

A new tick does not start while the previous one is still running.

## Transaction store

`TransactionStore` keeps transactions in memory, bounded by `TRANSACTION_STORE_LIMIT`. When full, the oldest finished transaction is evicted and its `order_id` is released. `PENDING` transactions are never evicted.

The store is intentionally not persistent. This is a test tool, not a database.

## Expiry sweeper

Every second, `expireDueTransactions` looks for `PENDING` transactions past `expires_at` and marks them `EXPIRED`. The sweeper never overlaps with itself.

`GET /v1/transactions/:id` also checks expiry, so a client never reads a stale state.

## When things fail

| Event                        | Impact                                     | Behavior                                                                                                                  |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Redis unreachable at startup | The queue runs in memory                   | Warning in the log. The app keeps working.                                                                                |
| Redis drops while running    | Payments, failures, and expiry are delayed | Actions that need the queue return `503 QUEUE_UNAVAILABLE` and leave state unchanged. The connection recovers on its own. |
| Process dies mid-delivery    | The job is stuck in `leased`               | Recovered after the lease expires (Redis only).                                                                           |
| Your app is slow or down     | Delivery fails                             | Retries with backoff. After the limit, the job is dropped and logged.                                                     |
| Rescheduling a webhook fails | The job is unfinished                      | It is not acked, so it is recovered after the lease expires.                                                              |
| Store capacity reached       | New charges are rejected                   | `503 STORE_FULL`, unless a finished transaction can be evicted.                                                           |

## Known limits

- Transactions are not persisted. A restart loses everything.
- The in-memory queue is also lost on restart.
- A transaction evicted from the store returns `404` on future reads.
- Transaction storage is not shared between instances. Several instances can share one Redis queue, but each transaction is only known to the instance that created it.
- The simulator does not validate that `callback_url` is safe. Do not run it on a network where someone could point it at internal services.
