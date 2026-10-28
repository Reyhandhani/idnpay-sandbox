import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATUS_CODES, type TransactionStatus } from "../src/config/constants";
import { buildWebhookJob } from "../src/services/webhook-job";
import { makeTransaction, START_TIME } from "./helpers";

describe("buildWebhookJob", () => {
  for (const status of ["PAID", "FAILED", "EXPIRED"] as TransactionStatus[]) {
    it(`maps ${status} to status_code ${STATUS_CODES[status]}`, () => {
      const transaction = makeTransaction({ order_id: "ORDER-1" });

      const job = buildWebhookJob({ transaction, status, now: START_TIME, secretKey: "secret" });
      const body = JSON.parse(job.body) as { status_code: string; transaction_status: string };

      assert.equal(body.status_code, STATUS_CODES[status]);
      assert.equal(body.transaction_status, status);
    });
  }

  it("copies transaction fields into the payload", () => {
    const transaction = makeTransaction({
      transaction_id: "trx-1",
      order_id: "ORDER-1",
      gross_amount: 125000,
      payment_type: "bank_transfer",
    });

    const job = buildWebhookJob({ transaction, status: "PAID", now: START_TIME, secretKey: "secret" });
    const body = JSON.parse(job.body) as Record<string, unknown>;

    assert.equal(body.transaction_id, "trx-1");
    assert.equal(body.order_id, "ORDER-1");
    assert.equal(body.gross_amount, 125000);
    assert.equal(body.payment_type, "bank_transfer");
    assert.equal(job.transaction_id, "trx-1");
    assert.equal(job.callback_url, transaction.callback_url);
    assert.equal(job.failures, 0);
  });

  it("signs order_id, status_code, and gross_amount", () => {
    const transaction = makeTransaction({ order_id: "ORDER-9", gross_amount: 50000 });

    const paid = buildWebhookJob({ transaction, status: "PAID", now: START_TIME, secretKey: "secret" });
    const failed = buildWebhookJob({ transaction, status: "FAILED", now: START_TIME, secretKey: "secret" });

    assert.notEqual(paid.signature, failed.signature);
  });

  it("returns a new job id on every call", () => {
    const transaction = makeTransaction();

    const first = buildWebhookJob({ transaction, status: "PAID", now: START_TIME, secretKey: "secret" });
    const second = buildWebhookJob({ transaction, status: "PAID", now: START_TIME, secretKey: "secret" });

    assert.notEqual(first.id, second.id);
  });
});
