# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-10-28

### Added

- `SIMULATED_FAILURE_STATUS`, so a failing call can return 504 or any other 4xx/5xx status
- A Midtrans-compatible subset under `/v2`, with `signature_key` webhooks
- `Idempotency-Key` support on both charge endpoints
- A CI guide with a GitHub Actions recipe, a two-container compose example, and edge-case recipes
- `DESIGN.md`, recording the visual direction and the reason for each choice
- A request flow diagram and a social preview image

### Changed

- README now opens with why the project exists and what it does not do
- Dashboard: sentence-case labels, a manual light and dark toggle, 44px tap targets, a scrollable table, and explicit empty, loading, and error states
- Code comments trimmed to the constraint they document

### Fixed

- README claimed Virtual Account prefixes were real bank numbers. They are illustrative.
- `dist/` is removed before build and test, so deleted modules cannot run from stale output.

## [0.1.0] - 2026-10-28

First release.

### Added

- Charges for QRIS (EMVCo payload with CRC-16), Virtual Accounts per bank, and e-Wallet deeplinks
- States `PENDING`, `PAID`, `FAILED`, and `EXPIRED`, with simulation endpoints and automatic expiry
- Webhooks signed with HMAC-SHA256, with retries and exponential backoff
- At-least-once delivery using leases. A job is removed only after the worker records its outcome
- Automatic recovery of jobs whose lease expired (Redis queue)
- In-memory queue fallback when Redis is unavailable, and automatic Redis reconnection
- Transaction store limit through `TRANSACTION_STORE_LIMIT`
- Simulated latency and random failures, with a configurable failure status
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
