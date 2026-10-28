# Running in CI

The simulator is a normal container, so CI runs it the same way you do. No account, no network, no tunnel, and no rate limit from a third party.

## GitHub Actions

```yaml
jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Start the simulator
        run: docker compose up -d --build --wait

      - name: Run integration tests
        env:
          IDNPAY_URL: http://localhost:9000
          IDNPAY_CLIENT_KEY: idnpay-dev-client-key
        run: npm test

      - name: Stop the simulator
        if: always()
        run: docker compose down
```

`--wait` returns once the container health check passes, so the next step never races the server. Keep `SIMULATED_FAILURE_RATE=0` here, except in tests written for failure handling.

## Your app and the simulator in one compose file

Callbacks work container to container. Use the service name as the host, not `localhost`.

```yaml
services:
  app:
    build: .
    ports: ["8000:8000"]
    environment:
      IDNPAY_CALLBACK_URL: http://simulator:9000/v1/charge

  simulator:
    image: idnpay-sandbox:local
    environment:
      CLIENT_KEY: ci-client
      SECRET_KEY: ci-secret

  redis:
    image: redis:7-alpine
```

Create the charge with `callback_url` pointing at `http://app:8000/payments/webhook`. The webhook leaves the simulator and reaches your app without leaving the Docker network.

## Edge cases worth testing

**Provider timeout.** Make every `/v1` call fail with 504:

```bash
SIMULATED_FAILURE_RATE=1 SIMULATED_FAILURE_STATUS=504 docker compose up -d --build
```

**Webhook retries.** Let your callback return 500 the first three times, then 200. Watch the simulator log for `attempt` and `retry_in_ms`. With `WEBHOOK_RETRY_LIMIT=5`, the delays are 2, 4, 8, 16, and 32 seconds.

**Rejected signature.** Compute a signature with the wrong key and post it to your own webhook endpoint. Your app should answer 401. The simulator's formula is documented in [WEBHOOK.md](WEBHOOK.md).

**Slow receiver.** Sleep longer than `WEBHOOK_TIMEOUT_MS` in your handler. The simulator treats the attempt as failed and retries, which is what a real gateway does when your endpoint is too slow.

## Keeping tests deterministic

- Keep `SIMULATED_LATENCY_MS` and `SIMULATED_FAILURE_RATE` at `0` unless the test is about them.
- Use a fixed `CLIENT_KEY` and `SECRET_KEY` per job, not the defaults, so a leaked log does not match another environment.
- Give every test its own `order_id`. The store rejects duplicates.
- Wait for `/health` before the first request when you do not use `--wait`.
