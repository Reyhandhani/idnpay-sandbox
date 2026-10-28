import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { MemoryWebhookQueue } from "../src/queues/webhook-queue";
import { WebhookWorker } from "../src/queues/webhook-worker";
import { makeConfig, manualClock, TEST_CLIENT_KEY, TEST_SECRET_KEY } from "./helpers";

const basic = `Basic ${Buffer.from(`${TEST_SECRET_KEY}:`).toString("base64")}`;
const clientHeaders = { "x-client-key": TEST_CLIENT_KEY };
const v2Headers = { authorization: basic };

function chargeBody(overrides: Record<string, unknown> = {}) {
  return {
    transaction_details: { order_id: "ORDER-MT-1", gross_amount: 150000 },
    payment_type: "qris",
    callback_url: "http://merchant.test/webhook",
    ...overrides,
  };
}

describe("Midtrans compatibility layer", () => {
  let app: FastifyInstance;
  let queue: MemoryWebhookQueue;
  let deliveries: Array<{ headers: Record<string, string>; body: string }>;
  let worker: WebhookWorker;

  beforeEach(async () => {
    const clock = manualClock();
    queue = new MemoryWebhookQueue();
    deliveries = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      deliveries.push({ headers: init?.headers as Record<string, string>, body: String(init?.body) });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    app = await buildApp(makeConfig(), { queue, clock: clock.now, startBackground: false });
    worker = new WebhookWorker({
      queue,
      logger: app.log,
      retryLimit: 5,
      timeoutMs: 1000,
      tickMs: 10,
      clock: clock.now,
      fetchImpl,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects requests without the server key", async () => {
    const response = await app.inject({ method: "POST", url: "/v2/charge", payload: chargeBody() });
    assert.equal(response.statusCode, 401);
  });

  it("creates a charge with the Midtrans response shape", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v2/charge",
      headers: v2Headers,
      payload: chargeBody({
        payment_type: "bank_transfer",
        bank_transfer: { bank: "bca" },
      }),
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.transaction_status, "pending");
    assert.equal(body.status_code, "201");
    assert.equal(body.gross_amount, "150000.00");
    assert.equal(body.fraud_status, "accept");
    assert.equal(body.va_numbers[0].bank, "bca");
  });

  it("serves the order status by order_id", async () => {
    await app.inject({ method: "POST", url: "/v2/charge", headers: v2Headers, payload: chargeBody() });
    const created = await app.inject({
      method: "GET",
      url: "/v2/ORDER-MT-1/status",
      headers: v2Headers,
    });
    assert.equal(created.statusCode, 200);
    assert.equal(created.json().order_id, "ORDER-MT-1");
  });

  it("sends a Midtrans webhook with signature_key and no custom header", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v2/charge",
      headers: v2Headers,
      payload: chargeBody(),
    });
    const transactionId = created.json().transaction_id as string;

    await app.inject({
      method: "POST",
      url: "/v1/simulate/pay",
      headers: clientHeaders,
      payload: { transaction_id: transactionId },
    });
    await worker.tick();

    const [delivery] = deliveries;
    assert.ok(delivery);
    const body = JSON.parse(delivery.body) as Record<string, string>;
    assert.equal(body.transaction_status, "settlement");
    assert.equal(body.status_code, "200");
    assert.equal(delivery.headers["x-idnpay-signature"], undefined);

    const expected = createHash("sha512").update(`ORDER-MT-1200150000${TEST_SECRET_KEY}`).digest("hex");
    assert.equal(body.signature_key, expected);
  });

  it("rejects a payment_type it does not model", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v2/charge",
      headers: v2Headers,
      payload: chargeBody({ payment_type: "credit_card" }),
    });
    assert.equal(response.statusCode, 400);
  });

  it("returns the same transaction for a repeated Idempotency-Key", async () => {
    const headers = { ...v2Headers, "idempotency-key": "key-1" };
    const first = await app.inject({ method: "POST", url: "/v2/charge", headers, payload: chargeBody() });
    const second = await app.inject({ method: "POST", url: "/v2/charge", headers, payload: chargeBody() });

    assert.equal(second.statusCode, 201);
    assert.equal(second.json().transaction_id, first.json().transaction_id);
  });

  it("also honours Idempotency-Key on the native endpoint", async () => {
    const headers = { ...clientHeaders, "idempotency-key": "key-2" };
    const payload = {
      order_id: "ORDER-NATIVE-IDEM",
      gross_amount: 1000,
      payment_type: "qris",
      callback_url: "http://merchant.test/webhook",
    };
    const first = await app.inject({ method: "POST", url: "/v1/charge", headers, payload });
    const second = await app.inject({ method: "POST", url: "/v1/charge", headers, payload });

    assert.equal(second.json().transaction_id, first.json().transaction_id);
  });
});
