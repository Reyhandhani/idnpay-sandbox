import { randomUUID } from "node:crypto";
import {
  BANKS,
  EWALLET_PROVIDERS,
  type Bank,
  type EwalletProvider,
  type PaymentType,
} from "../config/constants";
import { errors } from "../errors";
import type { PaymentDetails } from "../types";
import { buildEwalletDeeplink, generateVirtualAccountNumber } from "./payment-methods";
import { buildQrisPayload } from "./qris";

export interface PaymentDetailsInput {
  readonly orderId: string;
  readonly grossAmount: number;
  readonly paymentType: PaymentType;
  readonly bank?: Bank;
  readonly ewallet?: EwalletProvider;
  readonly transactionId: string;
}

export interface MerchantProfile {
  readonly name: string;
  readonly city: string;
}

export function buildPaymentDetails(input: PaymentDetailsInput, merchant: MerchantProfile): PaymentDetails {
  switch (input.paymentType) {
    case "qris":
      return {
        type: "qris",
        qr_string: buildQrisPayload({
          orderId: input.orderId,
          amount: input.grossAmount,
          merchantName: merchant.name,
          merchantCity: merchant.city,
        }),
      };
    case "bank_transfer":
      if (!input.bank) {
        throw errors.validation(
          `Field "bank" wajib diisi untuk payment_type bank_transfer. Pilihan: ${BANKS.join(", ")}.`,
        );
      }
      return { type: "bank_transfer", bank: input.bank, va_number: generateVirtualAccountNumber(input.bank) };
    case "ewallet":
      if (!input.ewallet) {
        throw errors.validation(
          `Field "ewallet" wajib diisi untuk payment_type ewallet. Pilihan: ${EWALLET_PROVIDERS.join(", ")}.`,
        );
      }
      return {
        type: "ewallet",
        provider: input.ewallet,
        deeplink_url: buildEwalletDeeplink(input.ewallet, input.transactionId),
      };
  }
}

export function newTransactionId(): string {
  return `trx-${randomUUID()}`;
}
