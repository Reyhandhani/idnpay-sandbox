export const PAYMENT_TYPES = ["qris", "bank_transfer", "ewallet"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const BANKS = ["bca", "mandiri", "bri", "bni", "permata"] as const;
export type Bank = (typeof BANKS)[number];

export const EWALLET_PROVIDERS = ["gopay", "ovo", "shopeepay", "dana"] as const;
export type EwalletProvider = (typeof EWALLET_PROVIDERS)[number];

export type TransactionStatus = "PENDING" | "PAID" | "EXPIRED" | "FAILED";

export const STATUS_CODES: Readonly<Record<TransactionStatus, string>> = {
  PENDING: "201",
  PAID: "200",
  FAILED: "202",
  EXPIRED: "407",
};

/** Virtual Account prefix per bank. Mirrors the real patterns so numbers are easy to spot. */
export const VA_PREFIXES: Readonly<Record<Bank, string>> = {
  bca: "14391",
  mandiri: "88608",
  bri: "26215",
  bni: "9880",
  permata: "8562",
};

export const VA_LENGTH = 16;

export const EWALLET_DEEPLINK_SCHEMES: Readonly<Record<EwalletProvider, string>> = {
  gopay: "gojek://gopay/pay",
  ovo: "ovo://pay",
  shopeepay: "shopeeid://pay",
  dana: "dana://pay",
};

/** Western Indonesia Time (UTC+7). Indonesia has no daylight saving. */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const WEBHOOK_BASE_DELAY_MS = 1000;

export const SIGNATURE_HEADER = "x-idnpay-signature";
export const TIMESTAMP_HEADER = "x-idnpay-timestamp";
export const CLIENT_KEY_HEADER = "x-client-key";
