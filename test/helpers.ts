import { loadConfig, type AppConfig } from "../src/config/env";
import type { Transaction } from "../src/types";

export const TEST_CLIENT_KEY = "test-client-key";
export const TEST_SECRET_KEY = "test-secret-key";
export const START_TIME = Date.UTC(2026, 9, 28, 5, 0, 0);

export function makeConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    CLIENT_KEY: TEST_CLIENT_KEY,
    SECRET_KEY: TEST_SECRET_KEY,
    LOG_LEVEL: "silent",
    DASHBOARD_ENABLED: "false",
    ...overrides,
  });
}

export function manualClock(start: number = START_TIME) {
  let current = start;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transaction_id: `trx-${Math.random().toString(36).slice(2)}`,
    order_id: `ORDER-${Math.random().toString(36).slice(2)}`,
    gross_amount: 10000,
    payment_type: "qris",
    callback_url: "http://merchant.test/webhook",
    payment: { type: "qris", qr_string: "000201" },
    flavor: "native",
    created_at: START_TIME,
    expires_at: START_TIME + 3_600_000,
    status: "PENDING",
    paid_at: null,
    ...overrides,
  };
}
