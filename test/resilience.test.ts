import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { MemoryWebhookQueue } from "../src/queues/webhook-queue";
import { WebhookWorker } from "../src/queues/webhook-worker";
import type { WebhookJob } from "../src/types";
import { makeConfig, manualClock, TEST_CLIENT_KEY } from "./helpers";

class ToggleableQueue extends MemoryWebhookQueue {
  available = true;

  override async enqueue(item: { runAt: number; job: WebhookJob }): Promise<void> {
    if (!this.available) {
      throw new Error("ECONNRESET");
    }
    await super.enqueue(item);
  }
}

const headers = { "x-client-key": TEST_CLIENT_KEY };

function chargePayload(orderId: string) {
  return {
    order_id: orderId,
    gross_amount: 20000,
    payment_type: "qris",
    callback_url: "http://merchant.test/webhook",
  };
}

describe("queue failure resilience", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("keeps PENDING when the webhook cannot be scheduled, and the retry still delivers it", async () => {
    const clock = manualClock();
    const queue = new ToggleableQueue();
    const deliveries: string[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      deliveries.push(String(init?.body));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    app = await buildApp(makeConfig(), { queue, clock: clock.now, startBackground: false });
    const created = await app.inject({
      method: "POST",
      url: "/v1/charge",
      headers,
      payload: chargePayload("ORDER-RES-1"),
    });
    const transactionId = created.json().transaction_id as string;

    queue.available = false;
    const failed = await app.inject({
      method: "POST",
      url: "/v1/simulate/pay",
      headers,
      payload: { transaction_id: transactionId },
    });
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.json().error_code, "QUEUE_UNAVAILABLE");

    const status = await app.inject({ method: "GET", url: `/v1/transactions/${transactionId}`, headers });
    assert.equal(status.json().transaction_status, "PENDING");

    queue.available = true;
    const retried = await app.inject({
      method: "POST",
      url: "/v1/simulate/pay",
      headers,
      payload: { transaction_id: transactionId },
    });
    assert.equal(retried.statusCode, 200);
    assert.equal(retried.json().transaction_status, "PAID");

    const worker = new WebhookWorker({
      queue,
      logger: app.log,
      retryLimit: 5,
      timeoutMs: 1000,
      tickMs: 10,
      clock: clock.now,
      fetchImpl,
    });
    await worker.tick();
    assert.equal(deliveries.length, 1);
    assert.equal(JSON.parse(deliveries[0]!).transaction_status, "PAID");
  });

  it("only one of two concurrent actions on the same transaction succeeds", async () => {
    const clock = manualClock();
    const queue = new MemoryWebhookQueue();
    app = await buildApp(makeConfig(), { queue, clock: clock.now, startBackground: false });
    const created = await app.inject({
      method: "POST",
      url: "/v1/charge",
      headers,
      payload: chargePayload("ORDER-RACE-1"),
    });
    const payload = { transaction_id: created.json().transaction_id };

    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/v1/simulate/pay", headers, payload }),
      app.inject({ method: "POST", url: "/v1/simulate/pay", headers, payload }),
    ]);

    const codes = responses.map((response) => response.statusCode).sort();
    assert.deepEqual(codes, [200, 409]);
  });
});
