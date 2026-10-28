import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQrisPayload, crc16 } from "../src/services/qris";

describe("crc16", () => {
  it("menghasilkan nilai uji standar CRC-16/CCITT-FALSE", () => {
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

  it("diawali dengan payload format indicator dan point of initiation dinamis", () => {
    assert.ok(payload.startsWith("000201010212"));
  });

  it("memuat nominal dan mata uang IDR", () => {
    assert.ok(payload.includes("5303360"));
    assert.ok(payload.includes("5406150000"));
  });

  it("memuat bill number yang sudah dibersihkan dari karakter khusus", () => {
    const sanitized = buildQrisPayload({
      orderId: "ORD-1.2/3",
      amount: 1000,
      merchantName: "TOKO",
      merchantCity: "BANDUNG",
    });
    assert.ok(sanitized.includes("6210" + "0106ORD123"));
  });

  it("diakhiri dengan tag CRC yang sesuai dengan isi payload", () => {
    const body = payload.slice(0, -4);
    assert.ok(payload.endsWith(crc16(body)));
    assert.ok(body.endsWith("6304"));
  });

  it("menghasilkan payload yang berbeda untuk nominal yang berbeda", () => {
    const other = buildQrisPayload({
      orderId: "ORDER-10293",
      amount: 150001,
      merchantName: "IDNPAY MOCK",
      merchantCity: "JAKARTA",
    });
    assert.notEqual(payload, other);
  });
});
