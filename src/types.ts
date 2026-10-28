import type { Bank, EwalletProvider, PaymentType, TransactionStatus } from "./config/constants";

export type PaymentDetails =
  | { readonly type: "qris"; readonly qr_string: string }
  | { readonly type: "bank_transfer"; readonly bank: Bank; readonly va_number: string }
  | { readonly type: "ewallet"; readonly provider: EwalletProvider; readonly deeplink_url: string };

export interface Transaction {
  readonly transaction_id: string;
  readonly order_id: string;
  readonly gross_amount: number;
  readonly payment_type: PaymentType;
  readonly callback_url: string;
  readonly payment: PaymentDetails;
  readonly created_at: number;
  readonly expires_at: number;
  status: TransactionStatus;
  paid_at: number | null;
}

export interface WebhookJob {
  readonly id: string;
  readonly transaction_id: string;
  readonly callback_url: string;
  readonly body: string;
  readonly signature: string;
  readonly failures: number;
}
