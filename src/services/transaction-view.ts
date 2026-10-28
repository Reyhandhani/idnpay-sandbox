import { STATUS_CODES } from "../config/constants";
import type { Transaction } from "../types";
import { formatWib } from "./time";

export interface TransactionView {
  status_code: string;
  transaction_id: string;
  order_id: string;
  gross_amount: number;
  payment_type: string;
  transaction_status: string;
  expiry_time: string;
  qr_string?: string;
  bank?: string;
  va_number?: string;
  provider?: string;
  deeplink_url?: string;
}

/** Bentuk respons publik sebuah transaksi, dipakai oleh endpoint charge dan status. */
export function toTransactionView(transaction: Transaction): TransactionView {
  const view: TransactionView = {
    status_code: STATUS_CODES[transaction.status],
    transaction_id: transaction.transaction_id,
    order_id: transaction.order_id,
    gross_amount: transaction.gross_amount,
    payment_type: transaction.payment_type,
    transaction_status: transaction.status,
    expiry_time: formatWib(transaction.expires_at),
  };

  const details = transaction.payment;
  switch (details.type) {
    case "qris":
      view.qr_string = details.qr_string;
      break;
    case "bank_transfer":
      view.bank = details.bank;
      view.va_number = details.va_number;
      break;
    case "ewallet":
      view.provider = details.provider;
      view.deeplink_url = details.deeplink_url;
      break;
  }

  return view;
}
