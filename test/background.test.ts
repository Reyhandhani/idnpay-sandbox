import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { MemoryWebhookQueue } from "../src/queues/webhook-queue";
import { makeConfig, manualClock, TEST_CLIENT_KEY } from "./helpers";

const headers = { "x-client-key": TEST_CLIENT_KEY };

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
}

describe("background processes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("the expiry sweeper and worker run on their own and send an EXPIRED webhook", async () => {
    const clock = manualClock();
    const deliveries: string[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      deliveries.push(String(init?.body));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    app = await buildApp(makeConfig({ WEBHOOK_TICK_MS: "20" }), {
      queue: new MemoryWebhookQueue(),
      clock: clock.now,
      startBackground: true,
      fetchImpl,
    });
    await app.ready();

    const created = await app.inject({
      method: "POST",
      url: "/v1/charge",
      headers,
      payload: {
        order_id: "ORDER-BG-1",
        gross_amount: 15000,
        payment_type: "qris",
        callback_url: "http://merchant.test/webhook",
      },
    });
    assert.equal(created.statusCode, 201);

    clock.advance(60 * 60 * 1000 + 1);

    const delivered = await waitFor(() => deliveries.length > 0, 5000);
    assert.ok(delivered, "the background process did not send the EXPIRED webhook");
    const body = JSON.parse(deliveries[0]!) as { transaction_status: string; order_id: string };
    assert.equal(body.transaction_status, "EXPIRED");
    assert.equal(body.order_id, "ORDER-BG-1");
  });

  it("starts no background work when startBackground is false", async () => {
    const clock = manualClock();
    const deliveries: string[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      deliveries.push(String(init?.body));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    app = await buildApp(makeConfig({ WEBHOOK_TICK_MS: "20" }), {
      queue: new MemoryWebhookQueue(),
      clock: clock.now,
      startBackground: false,
      fetchImpl,
    });
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/v1/charge",
      headers,
      payload: {
        order_id: "ORDER-NOBG",
        gross_amount: 15000,
        payment_type: "qris",
        callback_url: "http://merchant.test/webhook",
      },
    });
    clock.advance(60 * 60 * 1000 + 1);

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(deliveries.length, 0);
  });
});
