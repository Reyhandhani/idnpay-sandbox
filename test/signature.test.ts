import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { signWebhook } from "../src/services/signature";

describe("signWebhook", () => {
  const payload = { orderId: "ORDER-10293", statusCode: "200", grossAmount: 150000 };

  it("returns HMAC-SHA256 hex over order_id, status_code, and gross_amount", () => {
    const expected = createHmac("sha256", "secret").update("ORDER-10293200150000").digest("hex");
    assert.equal(signWebhook(payload, "secret"), expected);
  });

  it("differs when the key differs", () => {
    assert.notEqual(signWebhook(payload, "secret-a"), signWebhook(payload, "secret-b"));
  });

  it("differs when the status changes", () => {
    assert.notEqual(signWebhook(payload, "secret"), signWebhook({ ...payload, statusCode: "407" }, "secret"));
  });
});
