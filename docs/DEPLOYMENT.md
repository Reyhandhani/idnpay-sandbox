# Deployment

The simulator needs a process that keeps running, not serverless. That is the whole answer, and the rest of this page explains why and what to use instead.

If you only need it on your laptop, `docker compose up -d --build` is enough and you can skip this page.

## Why not serverless (Vercel, Netlify Functions, and friends)

The simulator keeps transactions in process memory, runs two background timers (an expiry sweeper every second and a webhook worker), and relies on the same process holding the queue lease. Serverless invokes a function per request and then stops it, so:

- Transactions disappear between requests.
- Timers never run, so nothing expires and no webhook is ever delivered.
- Backoff retries cannot be trusted, because no process is waiting.

Vercel does not provide Redis itself. You can add one from a marketplace provider, but the first two problems remain: transaction state and timers do not survive between invocations. The Hobby plan is also limited to non-commercial use.

## What fits

Anything that runs a container and leaves it running:

- A small VPS with Docker Compose. This is the simplest option, and the repository already has a `docker-compose.yml`.
- A container platform such as Fly.io, Railway, Render, or Koyeb, on a plan that does not stop the instance when idle.
- Kubernetes, if you already run it.

If you need more than one instance, set `REDIS_URL` so the webhook queue is shared. Transaction storage stays per instance, so send clients to the same instance (sticky sessions, for example) or run a single instance.

## On a VPS

```bash
git clone https://github.com/Reyhandhani/idnpay-sandbox.git
cd idnpay-sandbox
cp .env.example .env
# Edit .env: change CLIENT_KEY and SECRET_KEY.
docker compose up -d --build
```

Check it with `curl http://localhost:9000/health`. For HTTPS, put a reverse proxy such as Caddy or Nginx in front.

## Before you expose it

This tool sends HTTP POST requests to any address a client gives it. If it is reachable from the internet:

- Change `CLIENT_KEY` and `SECRET_KEY`. The defaults are in the documentation.
- Keep it away from internal services that matter. `callback_url` can point at internal addresses.
- Add authentication at the reverse proxy if only you should use it.
- Set `DASHBOARD_ENABLED=false` if the dashboard does not need to be public. It has no login of its own.
- Set `TRANSACTION_STORE_LIMIT` to something sensible for the memory you have.

## If you only need temporary access

Use a tunnel instead of deploying:

```bash
cloudflared tunnel --url http://localhost:9000
# or
ngrok http 9000
```

The simulator keeps running on your laptop, and no test data is left on a server.
