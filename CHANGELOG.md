# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - unreleased

First release.

### Added

- Charges for QRIS (EMVCo payload with CRC-16), Virtual Accounts per bank, and e-Wallet deeplinks
- States `PENDING`, `PAID`, `FAILED`, and `EXPIRED`, with simulation endpoints and automatic expiry
- Webhooks signed with HMAC-SHA256, with retries and exponential backoff
- At-least-once delivery using leases. A job is removed only after the worker records its outcome
- Automatic recovery of jobs whose lease expired (Redis queue)
- In-memory queue fallback when Redis is unavailable, and automatic Redis reconnection
- Transaction store limit through `TRANSACTION_STORE_LIMIT`
- Simulated latency and random failures
- Browser dashboard with a connection test and a three-step flow
- Error codes `TRANSACTION_BUSY`, `QUEUE_UNAVAILABLE`, and `STORE_FULL`
- ESLint, Prettier, and CI on Node.js 22 and 24 with a real Redis, plus a Docker image build
- Test coverage gate: at least 90% lines, 85% branches and functions
- Documentation for the API, webhooks, configuration, architecture, and deployment

### Security

- Webhooks are scheduled before the state changes. If scheduling fails, the transaction stays `PENDING`, so no notification is lost silently.
- `X-Client-Key` and signature comparisons use `timingSafeEqual`.

### Changed

- Documentation, code comments, test names, dashboard text, and messages returned to clients are written in English.
