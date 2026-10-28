# Contributing

Thanks for wanting to help. This page covers setting up, checking your work, and sending a pull request.

Participation follows our [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You need Node.js 22 or newer.

```bash
git clone https://github.com/Reyhandhani/idnpay-sandbox.git
cd idnpay-sandbox
npm ci
npm run ci
```

`npm run ci` runs formatting, lint, typecheck, tests with coverage, and the build. Make it pass before opening a pull request.

For the Redis integration tests, start a local Redis and point `TEST_REDIS_URL` at it:

```bash
docker run -d --name redis-test -p 6379:6379 redis:7-alpine
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
```

## Workflow

1. Open an issue first for larger changes, or anything that affects the API or webhook format.
2. Branch from `main`, with a name that says what it does, for example `fix/redis-reconnect`.
3. Write tests with the change. For a bug, write the failing test first.
4. If public behavior changes, update `docs/` and `README.md`, and add a note to `CHANGELOG.md`.
5. Open the pull request and explain why, not just what.

## Conventions

- Everything in the repository is in English: code, comments, tests, messages returned to clients, and documentation. Keep sentences short.
- Write a comment only when the code cannot explain itself, such as why one operation must happen before another.
- Errors use `AppError` with a stable code. Add new codes in `src/errors.ts` and list them in `docs/API.md`.
- A new environment variable needs an entry in `src/config/env.ts`, a test in `test/config.test.ts`, and docs in `docs/CONFIGURATION.md` plus `.env.example`.
- Do not add a third-party crypto library. Use Node's `crypto` module.

## Tests

- Every behavior change needs a test.
- Tests live in `test/`. Shared helpers are in `test/helpers.ts` and `test/support/`.
- Use `manualClock` from `test/helpers.ts` for time-dependent logic. Avoid long `setTimeout` calls in tests.
- `npm run test:coverage` runs in CI and fails below 90% lines or 85% branches and functions.

## Pull requests

CI runs on Node.js 22 and 24, with a real Redis, and builds the Docker image. Wait for it to go green before asking for review.
