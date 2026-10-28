import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { MemoryWebhookQueue } from "../src/queues/webhook-queue";
import { WebhookWorker } from "../src/queues/webhook-worker";
import { makeConfig, manualClock, TEST_CLIENT_KEY, TEST_SECRET_KEY } from "./helpers";

type Clock = ReturnType<typeof manualClock>;

interface Harness {
  app: FastifyInstance;
  clock: Clock;
  queue: MemoryWebhookQueue;
  deliveries: Array<{ url: string; headers: Record<string, string>; body: string }>;
  worker: WebhookWorker;
}

async function createHarness(): Promise<Harness> {
  const clock = manualClock();
  const queue = new MemoryWebhookQueue();
  const deliveries: Harness["deliveries"] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    deliveries.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: String(init?.body),
    });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  const app = await buildApp(makeConfig(), { queue, clock: clock.now, startBackground: false });
  const worker = new WebhookWorker({
    queue,
    logger: app.log,
    retryLimit: 5,
    timeoutMs: 1000,
    tickMs: 10,
    clock: clock.now,
    fetchImpl,
  });
  return { app, clock, queue, deliveries, worker };
}

const authHeaders = { "x-client-key": TEST_CLIENT_KEY };

function chargePayload(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "ORDER-10293",
    gross_amount: 150000,
    payment_type: "qris",
    callback_url: "http://host.docker.internal:8000/api/payments/webhook",
    ...overrides,
  };
}

describe("idnpay-sandbox API", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.app.close();
  });

  describe("authentication", () => {
    it("rejects requests without X-Client-Key", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        payload: chargePayload(),
      });
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().error_code, "UNAUTHORIZED");
    });

    it("rejects a wrong X-Client-Key", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: { "x-client-key": "salah" },
        payload: chargePayload(),
      });
      assert.equal(response.statusCode, 401);
    });

    it("health needs no authentication", async () => {
      const response = await harness.app.inject({ method: "GET", url: "/health" });
      assert.equal(response.statusCode, 200);
    });
  });

  describe("POST /v1/charge", () => {
    it("creates a PENDING QRIS transaction", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload(),
      });

      assert.equal(response.statusCode, 201);
      const body = response.json();
      assert.equal(body.status_code, "201");
      assert.equal(body.transaction_status, "PENDING");
      assert.equal(body.payment_type, "qris");
      assert.match(body.transaction_id, /^trx-/);
      assert.match(body.qr_string, /^000201/);
      assert.match(body.expiry_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it("creates a Virtual Account with the bank prefix", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ payment_type: "bank_transfer", bank: "bca" }),
      });

      assert.equal(response.statusCode, 201);
      const body = response.json<{ bank: string; va_number: string }>();
      assert.equal(body.bank, "bca");
      assert.equal(body.va_number.length, 16);
      assert.ok(body.va_number.startsWith("14391"));
    });

    it("creates an e-wallet deeplink", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ payment_type: "ewallet", ewallet: "gopay" }),
      });

      assert.equal(response.statusCode, 201);
      assert.match(response.json().deeplink_url, /^gojek:\/\/gopay\/pay\?ref=trx-/);
    });

    it("rejects bank_transfer without a bank", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ payment_type: "bank_transfer" }),
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error_code, "VALIDATION_ERROR");
    });

    it("rejects zero or negative amounts", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ gross_amount: 0 }),
      });
      assert.equal(response.statusCode, 400);
    });

    it("lists invalid fields in details", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: { order_id: "ORDER-X", gross_amount: 1000 },
      });

      assert.equal(response.statusCode, 400);
      const body = response.json<{ details: Array<{ field: string }> }>();
      const fields = body.details.map((detail) => detail.field);
      assert.ok(fields.includes("payment_type"));
      assert.ok(fields.includes("callback_url"));
    });

    it("rejects callback_url with a protocol other than http or https", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ callback_url: "ftp://merchant.test/webhook" }),
      });
      assert.equal(response.statusCode, 400);
    });

    it("rejects unknown fields", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ unknown_field: true }),
      });
      assert.equal(response.statusCode, 400);
    });

    it("rejects a reused order_id", async () => {
      await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload(),
      });
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload(),
      });

      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error_code, "DUPLICATE_ORDER_ID");
    });
  });

  describe("payment simulation", () => {
    async function createPending(orderId = "ORDER-SIM") {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ order_id: orderId }),
      });
      return response.json<{ transaction_id: string }>();
    }

    it("moves the transaction to PAID and sends a signed webhook", async () => {
      const transaction = await createPending();

      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/simulate/pay",
        headers: authHeaders,
        payload: { transaction_id: transaction.transaction_id },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().transaction_status, "PAID");

      await harness.worker.tick();
      assert.equal(harness.deliveries.length, 1);

      const [delivery] = harness.deliveries;
      assert.ok(delivery);
      const body = JSON.parse(delivery.body);
      assert.equal(body.status_code, "200");
      assert.equal(body.order_id, "ORDER-SIM");
      assert.equal(body.gross_amount, 150000);
      assert.equal(body.transaction_status, "PAID");

      const expected = createHmac("sha256", TEST_SECRET_KEY)
        .update(`${body.order_id}${body.status_code}${body.gross_amount}`)
        .digest("hex");
      assert.equal(delivery.headers["x-idnpay-signature"], expected);
    });

    it("rejects a second payment once PAID", async () => {
      const transaction = await createPending();
      const payload = { transaction_id: transaction.transaction_id };
      await harness.app.inject({ method: "POST", url: "/v1/simulate/pay", headers: authHeaders, payload });

      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/simulate/pay",
        headers: authHeaders,
        payload,
      });
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error_code, "INVALID_TRANSACTION_STATE");
    });

    it("moves the transaction to FAILED", async () => {
      const transaction = await createPending();
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/simulate/fail",
        headers: authHeaders,
        payload: { transaction_id: transaction.transaction_id },
      });
      assert.equal(response.json().transaction_status, "FAILED");
      assert.equal(response.json().status_code, "202");
    });

    it("returns 404 for an unknown transaction", async () => {
      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/simulate/pay",
        headers: authHeaders,
        payload: { transaction_id: "trx-does-not-exist" },
      });
      assert.equal(response.statusCode, 404);
      assert.equal(response.json().error_code, "TRANSACTION_NOT_FOUND");
    });
  });

  describe("expiry", () => {
    it("expires a PENDING transaction after the deadline and sends a webhook", async () => {
      const created = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ order_id: "ORDER-EXP" }),
      });
      const transactionId = created.json().transaction_id as string;

      harness.clock.advance(60 * 60 * 1000);

      const response = await harness.app.inject({
        method: "GET",
        url: `/v1/transactions/${transactionId}`,
        headers: authHeaders,
      });
      assert.equal(response.json().transaction_status, "EXPIRED");
      assert.equal(response.json().status_code, "407");

      await harness.worker.tick();
      assert.equal(harness.deliveries.length, 1);
    });

    it("cannot be paid after expiry", async () => {
      const created = await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ order_id: "ORDER-LATE" }),
      });
      harness.clock.advance(60 * 60 * 1000 + 1);

      const response = await harness.app.inject({
        method: "POST",
        url: "/v1/simulate/pay",
        headers: authHeaders,
        payload: { transaction_id: created.json().transaction_id },
      });
      assert.equal(response.statusCode, 409);
    });
  });

  describe("GET /v1/transactions", () => {
    it("returns transactions newest first with a total", async () => {
      await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ order_id: "A-1" }),
      });
      harness.clock.advance(1000);
      await harness.app.inject({
        method: "POST",
        url: "/v1/charge",
        headers: authHeaders,
        payload: chargePayload({ order_id: "A-2" }),
      });

      const response = await harness.app.inject({
        method: "GET",
        url: "/v1/transactions?limit=1",
        headers: authHeaders,
      });
      const body = response.json();
      assert.equal(body.total, 2);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].order_id, "A-2");
    });
  });
});
