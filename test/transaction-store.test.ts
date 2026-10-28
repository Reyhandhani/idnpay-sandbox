import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../src/errors";
import { TransactionStore } from "../src/services/transaction-store";
import { makeTransaction } from "./helpers";

describe("TransactionStore", () => {
  it("stores and finds transactions by id", () => {
    const store = new TransactionStore({ maxSize: 10 });
    const transaction = makeTransaction({ transaction_id: "trx-a" });

    store.insert(transaction);

    assert.equal(store.findById("trx-a"), transaction);
    assert.equal(store.findAll().length, 1);
  });

  it("rejects a duplicate order_id", () => {
    const store = new TransactionStore({ maxSize: 10 });
    store.insert(makeTransaction({ transaction_id: "trx-a", order_id: "ORDER-1" }));

    assert.throws(
      () => store.insert(makeTransaction({ transaction_id: "trx-b", order_id: "ORDER-1" })),
      (error: unknown) => error instanceof AppError && error.code === "DUPLICATE_ORDER_ID",
    );
  });

  it("evicts the oldest finished transaction when full", () => {
    const store = new TransactionStore({ maxSize: 2 });
    store.insert(makeTransaction({ transaction_id: "trx-old", order_id: "O-1", status: "PAID" }));
    store.insert(makeTransaction({ transaction_id: "trx-pending", order_id: "O-2", status: "PENDING" }));

    store.insert(makeTransaction({ transaction_id: "trx-new", order_id: "O-3" }));

    assert.equal(store.findById("trx-old"), undefined);
    assert.ok(store.findById("trx-pending"));
    assert.ok(store.findById("trx-new"));
    assert.equal(store.findAll().length, 2);
  });

  it("releases order_id when a transaction is evicted", () => {
    const store = new TransactionStore({ maxSize: 2 });
    store.insert(makeTransaction({ transaction_id: "trx-old", order_id: "O-1", status: "EXPIRED" }));
    store.insert(makeTransaction({ transaction_id: "trx-other", order_id: "O-2" }));
    store.insert(makeTransaction({ transaction_id: "trx-third", order_id: "O-3", status: "PAID" }));

    assert.equal(store.findById("trx-old"), undefined);
    store.insert(makeTransaction({ transaction_id: "trx-reused", order_id: "O-1" }));
    assert.ok(store.findById("trx-reused"));
  });

  it("rejects a new transaction with STORE_FULL while everything is PENDING", () => {
    const store = new TransactionStore({ maxSize: 1 });
    store.insert(makeTransaction({ transaction_id: "trx-a", order_id: "O-1" }));

    assert.throws(
      () => store.insert(makeTransaction({ transaction_id: "trx-b", order_id: "O-2" })),
      (error: unknown) => error instanceof AppError && error.code === "STORE_FULL",
    );
  });
});
