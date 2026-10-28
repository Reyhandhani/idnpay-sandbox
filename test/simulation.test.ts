import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { MemoryWebhookQueue } from "../src/queues/webhook-queue";
import { makeConfig, manualClock, TEST_CLIENT_KEY } from "./helpers";

const headers = { "x-client-key": TEST_CLIENT_KEY };
const chargeBody = {
  order_id: "ORDER-SIM",
  gross_amount: 5000,
  payment_type: "qris",
  callback_url: "http://merchant.test/webhook",
};

describe("network simulation", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("fails every /v1 request with 503 when SIMULATED_FAILURE_RATE is 1", async () => {
    const instance = await buildApp(makeConfig({ SIMULATED_FAILURE_RATE: "1" }), {
      queue: new MemoryWebhookQueue(),
      clock: manualClock().now,
      startBackground: false,
    });
    app = instance;

    for (let i = 0; i < 5; i++) {
      const response = await instance.inject({
        method: "POST",
        url: "/v1/charge",
        headers,
        payload: chargeBody,
      });
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().error_code, "SIMULATED_UPSTREAM_FAILURE");
    }
  });

  it("returns the configured status for a simulated failure", async () => {
    const instance = await buildApp(
      makeConfig({ SIMULATED_FAILURE_RATE: "1", SIMULATED_FAILURE_STATUS: "504" }),
      {
        queue: new MemoryWebhookQueue(),
        clock: manualClock().now,
        startBackground: false,
      },
    );
    app = instance;

    const response = await instance.inject({ method: "GET", url: "/v1/transactions", headers });
    assert.equal(response.statusCode, 504);
    assert.equal(response.json().error_code, "SIMULATED_UPSTREAM_FAILURE");
  });

  it("health stays available while failures are simulated", async () => {
    app = await buildApp(makeConfig({ SIMULATED_FAILURE_RATE: "1" }), {
      queue: new MemoryWebhookQueue(),
      clock: manualClock().now,
      startBackground: false,
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
  });

  it("never fails a request when SIMULATED_FAILURE_RATE is 0", async () => {
    const instance = await buildApp(makeConfig(), {
      queue: new MemoryWebhookQueue(),
      clock: manualClock().now,
      startBackground: false,
    });
    app = instance;

    for (let i = 0; i < 20; i++) {
      const response = await instance.inject({
        method: "POST",
        url: "/v1/charge",
        headers,
        payload: { ...chargeBody, order_id: `ORDER-OK-${i}` },
      });
      assert.equal(response.statusCode, 201);
    }
  });

  it("adds at least SIMULATED_LATENCY_MS of latency", async () => {
    app = await buildApp(makeConfig({ SIMULATED_LATENCY_MS: "80" }), {
      queue: new MemoryWebhookQueue(),
      clock: manualClock().now,
      startBackground: false,
    });

    const started = performance.now();
    const response = await app.inject({ method: "GET", url: "/v1/transactions", headers });
    const elapsed = performance.now() - started;

    assert.equal(response.statusCode, 200);
    assert.ok(elapsed >= 75, `latency of ${elapsed.toFixed(1)} ms is too low`);
  });
});
