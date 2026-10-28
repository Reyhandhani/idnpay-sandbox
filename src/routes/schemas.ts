import { BANKS, EWALLET_PROVIDERS, PAYMENT_TYPES } from "../config/constants";

const transactionIdParam = {
  type: "object",
  required: ["transaction_id"],
  properties: {
    transaction_id: { type: "string", minLength: 1, maxLength: 100 },
  },
} as const;

export const createChargeSchema = {
  body: {
    type: "object",
    required: ["order_id", "gross_amount", "payment_type", "callback_url"],
    additionalProperties: false,
    properties: {
      order_id: { type: "string", minLength: 1, maxLength: 50, pattern: "^[A-Za-z0-9._-]+$" },
      gross_amount: { type: "integer", minimum: 1, maximum: 100_000_000 },
      payment_type: { type: "string", enum: [...PAYMENT_TYPES] },
      callback_url: { type: "string", minLength: 1, maxLength: 2048 },
      bank: { type: "string", enum: [...BANKS] },
      ewallet: { type: "string", enum: [...EWALLET_PROVIDERS] },
    },
  },
} as const;

export const orderParamsSchema = {
  params: {
    type: "object",
    required: ["order_id"],
    properties: {
      order_id: { type: "string", minLength: 1, maxLength: 50 },
    },
  },
} as const;

export const midtransChargeSchema = {
  body: {
    type: "object",
    required: ["transaction_details", "payment_type", "callback_url"],
    properties: {
      transaction_details: {
        type: "object",
        required: ["order_id", "gross_amount"],
        properties: {
          order_id: { type: "string", minLength: 1, maxLength: 50 },
          gross_amount: { type: "integer", minimum: 1, maximum: 100_000_000 },
        },
      },
      payment_type: { type: "string", minLength: 1, maxLength: 32 },
      bank_transfer: {
        type: "object",
        properties: { bank: { type: "string", minLength: 1, maxLength: 32 } },
      },
      echannel: { type: "object" },
      callback_url: { type: "string", minLength: 1, maxLength: 2048 },
      customer_details: { type: "object" },
      item_details: { type: "array" },
      custom_field1: { type: "string" },
      custom_field2: { type: "string" },
      custom_field3: { type: "string" },
    },
  },
} as const;

export const transactionParamsSchema = {
  params: transactionIdParam,
} as const;

export const simulateSchema = {
  body: transactionIdParam,
} as const;

export const listTransactionsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    },
  },
} as const;
