import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQrisPayload, crc16 } from "../src/services/qris";

describe("crc16", () => {
  it("matches the standard CRC-16/CCITT-FALSE test vector", () => {
    assert.equal(crc16("123456789"), "29B1");
  });
});

describe("buildQrisPayload", () => {
  const payload = buildQrisPayload({
    orderId: "ORDER-10293",
    amount: 150000,
    merchantName: "IDNPAY MOCK",
    merchantCity: "JAKARTA",
  });

  it("starts with the payload format indicator and a dynamic point of initiation", () => {
    assert.ok(payload.startsWith("000201010212"));
  });

  it("includes the amount and IDR currency", () => {
    assert.ok(payload.includes("5303360"));
    assert.ok(payload.includes("5406150000"));
  });

  it("includes a bill number stripped of special characters", () => {
    const sanitized = buildQrisPayload({
      orderId: "ORD-1.2/3",
      amount: 1000,
      merchantName: "TOKO",
      merchantCity: "BANDUNG",
    });
    assert.ok(sanitized.includes("6210" + "0106ORD123"));
  });

  it("ends with a CRC tag that matches the payload", () => {
    const body = payload.slice(0, -4);
    assert.ok(payload.endsWith(crc16(body)));
    assert.ok(body.endsWith("6304"));
  });

  it("differs when the amount differs", () => {
    const other = buildQrisPayload({
      orderId: "ORDER-10293",
      amount: 150001,
      merchantName: "IDNPAY MOCK",
      merchantCity: "JAKARTA",
    });
    assert.notEqual(payload, other);
  });
});
