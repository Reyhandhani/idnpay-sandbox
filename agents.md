# AGENTS.md & Specification: idnpay-sandbox 🇮🇩

> **Project Identity**: `idnpay-sandbox`  
> **Tagline**: Open-Source Local Payment Gateway Simulator for Indonesia  
> **Keywords for SEO & AI**: `indonesia payment gateway simulator`, `qris mock api`, `virtual account sandbox`, `midtrans alternative local emulator`, `idnpay-sandbox`, `webhook retry simulator`

---

## 🚀 Executive Summary & Goal

`idnpay-sandbox` is an offline-first, zero-dependency payment gateway emulator designed specifically for Indonesian software engineers. It simulates end-to-end payment lifecycles for Indonesian payment rails (QRIS, Virtual Accounts, e-Wallets) and dispatches reliable webhooks with HMAC SHA-256 signatures to local development environments or CI/CD pipelines.

---

## 🎯 Primary Use Cases & Architecture

1. **Local Payment Simulation**: Replaces external sandboxes (Midtrans/Xendit) to avoid downtime and rate limits.
2. **Stateful Transactions**: Manages transitions: `PENDING` ➔ `PAID` / `EXPIRED` / `FAILED`.
3. **Robust Webhooks**: Fires HTTP POST callbacks with exponential backoff retries (Redis-backed) when target local servers return non-200 responses.
4. **Security Testing**: Generates HMAC SHA-256 signatures (`X-IDNPay-Signature`) for backend verification testing.
5. **Resilience Testing**: Simulates network latencies and failure rates.

```
+-------------------+        1. POST /v1/charge         +-----------------------+
|                   | --------------------------------> |                       |
|  Your Backend App |                                   |    idnpay-sandbox     |
|  (Express/Laravel)| <-------------------------------- |   (Local Port 9000)   |
+-------------------+      2. Returns VA / QRIS payload +-----------------------+
          ^                                                         |
          |                                                         | 3. Trigger Pay
          |          4. Webhook Callback (with HMAC Signature)      v
          +-------------------------------------------------- [Redis Queue]
```

---

## 🛠️ API & Schema Specifications

### 1. Create Charge Transaction (`POST /v1/charge`)

**Headers**:
- `Content-Type: application/json`
- `X-Client-Key: <your-client-key>`

**Request Body**:
```json
{
  "order_id": "ORDER-10293",
  "gross_amount": 150000,
  "payment_type": "qris",
  "callback_url": "http://host.docker.internal:8000/api/payments/webhook"
}
```

**Response Body (QRIS Example)**:
```json
{
  "status_code": "201",
  "transaction_id": "trx-uuid-9981-abc",
  "order_id": "ORDER-10293",
  "gross_amount": 150000,
  "payment_type": "qris",
  "transaction_status": "PENDING",
  "qr_string": "00020101021226680016ID.CO.QRIS.WWW0118936000000000000000215ID102000000000053033605802ID5913IDNPAY MOCK6007JAKARTA61051211062070703A01630461F3",
  "expiry_time": "2026-10-28 12:00:00"
}
```

**Supported `payment_type` values**:
- `qris`: Static/Dynamic QRIS string.
- `bank_transfer`: Virtual Account (bca, mandiri, bri, bni, permata).
- `ewallet`: GoPay, OVO, ShopeePay, DANA deep-links.

### 2. Trigger Payment (`POST /v1/simulate/pay`)

**Request Body**:
```json
{
  "transaction_id": "trx-uuid-9981-abc"
}
```

### 3. Webhook HMAC SHA-256 Signature Verification

**Headers sent with Webhook**:
- `X-IDNPay-Signature`: `<sha256_hex_hash>`
- `X-IDNPay-Timestamp`: `<unix_timestamp>`

**Signature Calculation Formula**:
$$\text{Signature} = \text{HMAC-SHA256}(\text{order\_id} + \text{status\_code} + \text{gross\_amount} + \text{SECRET\_KEY})$$

---

## 🤖 System Execution Instructions for AI Developers (Cursor / Windsurf / Claude Code)

When scaffolding or building `idnpay-sandbox`, strictly adhere to these guidelines:

### Tech Stack Recommendation
- **Runtime**: Node.js (TypeScript) or Go.
- **HTTP Engine**: Fastify or Express.
- **Queue System**: Redis with BullMQ (or lightweight memory fallback if Redis unavailable).
- **Containerization**: Docker & Docker Compose with Multi-stage Alpine builds.

### Directory Structure Blueprint
```text
idnpay-sandbox/
├── src/
│   ├── config/          # Environment variables & constants
│   ├── controllers/     # API route handlers (charge, simulate, status)
│   ├── services/        # State manager, signature generator, QRIS builder
│   ├── queues/          # BullMQ worker & exponential retry logic
│   ├── routes/          # Express/Fastify endpoint definitions
│   └── app.ts           # Application entry point
├── public/              # Minimal HTML/JS dashboard for manual testing
├── Dockerfile           # Optimized runtime image
├── docker-compose.yml   # Ready-to-run setup with Redis
├── README.md            # User documentation
└── AGENTS.md            # Technical context (this file)
```

### Critical Rules for AI Agent Execution
1. **Zero External Dependencies for Crypto**: Use native Node.js `crypto` module or standard language library for SHA-256 HMAC operations.
2. **Exponential Backoff**: Webhook retries must follow delays of $2^n \times 1000\text{ ms}$ up to `WEBHOOK_RETRY_LIMIT` (default: 5).
3. **CORS & Docker Host Resolution**: Ensure `host.docker.internal` is properly documented for localhost callback targets inside Docker containers.
4. **Clean Logging**: All output logs must use structured JSON or clear terminal formatting (e.g., using `pino` or `winston`).