import { createHash } from "node:crypto";
import {
  BANKS,
  EWALLET_PROVIDERS,
  type Bank,
  type EwalletProvider,
  type PaymentType,
  type TransactionStatus,
} from "../config/constants";
import { STATUS_CODES } from "../config/constants";
import type { Transaction } from "../types";
import { formatWib } from "./time";

/** Midtrans status names, which differ from the internal ones. */
const MIDTRANS_STATUS: Readonly<Record<TransactionStatus, string>> = {
  PENDING: "pending",
  PAID: "settlement",
  FAILED: "deny",
  EXPIRED: "expire",
};

export interface MidtransChargeInput {
  readonly transaction_details: { readonly order_id: string; readonly gross_amount: number };
  readonly payment_type: string;
  readonly bank_transfer?: { readonly bank: string };
  readonly echannel?: { readonly bill_info1?: string };
  readonly callback_url: string;
}

export interface MappedCharge {
  readonly orderId: string;
  readonly grossAmount: number;
  readonly paymentType: PaymentType;
  readonly bank?: Bank;
  readonly ewallet?: EwalletProvider;
}

const EWALLET_TYPES: readonly string[] = EWALLET_PROVIDERS;

/** Maps a Midtrans charge body onto the internal input. Throws a status message on unsupported input. */
export function mapCharge(body: MidtransChargeInput): MappedCharge {
  const { order_id: orderId, gross_amount: grossAmount } = body.transaction_details;

  if (body.payment_type === "qris") {
    return { orderId, grossAmount, paymentType: "qris" };
  }

  if (body.payment_type === "bank_transfer" || body.payment_type === "echannel") {
    const bank = body.payment_type === "echannel" ? "mandiri" : body.bank_transfer?.bank;
    if (!bank) {
      throw new UnsupportedPaymentType("bank_transfer requires bank_transfer.bank");
    }
    if (!BANKS.includes(bank as Bank)) {
      throw new UnsupportedPaymentType(`bank ${bank} is not supported. Use ${BANKS.join(", ")}`);
    }
    return { orderId, grossAmount, paymentType: "bank_transfer", bank: bank as Bank };
  }

  if (EWALLET_TYPES.includes(body.payment_type)) {
    return {
      orderId,
      grossAmount,
      paymentType: "ewallet",
      ewallet: body.payment_type as EwalletProvider,
    };
  }

  throw new UnsupportedPaymentType(`payment_type ${body.payment_type} is not supported`);
}

export class UnsupportedPaymentType extends Error {}

/** SHA512 of order_id + status_code + gross_amount + server key, as Midtrans specifies. */
export function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: number,
  serverKey: string,
): string {
  return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
}

export interface MidtransResponse {
  readonly status_code: string;
  readonly status_message: string;
  readonly transaction_id: string;
  readonly order_id: string;
  readonly gross_amount: string;
  readonly payment_type: string;
  readonly transaction_time: string;
  readonly transaction_status: string;
  readonly fraud_status: string;
  readonly va_numbers?: ReadonlyArray<{ readonly bank: string; readonly va_number: string }>;
  readonly qr_string?: string;
  readonly deeplink_url?: string;
}

export function toMidtransResponse(transaction: Transaction): MidtransResponse {
  const base = {
    status_code: STATUS_CODES[transaction.status],
    status_message: "Success, transaction is found",
    transaction_id: transaction.transaction_id,
    order_id: transaction.order_id,
    gross_amount: `${transaction.gross_amount}.00`,
    payment_type: transaction.payment_type,
    transaction_time: formatWib(transaction.created_at),
    transaction_status: MIDTRANS_STATUS[transaction.status],
    fraud_status: "accept",
  };

  const payment = transaction.payment;
  if (payment.type === "bank_transfer") {
    return { ...base, va_numbers: [{ bank: payment.bank, va_number: payment.va_number }] };
  }
  if (payment.type === "qris") {
    return { ...base, qr_string: payment.qr_string };
  }
  return { ...base, deeplink_url: payment.deeplink_url };
}

export function midtransWebhookBody(
  transaction: Transaction,
  status: TransactionStatus,
  now: number,
  serverKey: string,
) {
  const statusCode = STATUS_CODES[status];
  return {
    transaction_time: formatWib(now),
    transaction_status: MIDTRANS_STATUS[status],
    transaction_id: transaction.transaction_id,
    status_message: "midtrans payment notification",
    status_code: statusCode,
    signature_key: midtransSignature(transaction.order_id, statusCode, transaction.gross_amount, serverKey),
    payment_type: transaction.payment_type,
    order_id: transaction.order_id,
    gross_amount: `${transaction.gross_amount}.00`,
    fraud_status: "accept",
    currency: "IDR",
  };
}
