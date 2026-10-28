import { randomUUID } from "node:crypto";
import { type PaymentType, STATUS_CODES, type TransactionStatus } from "../config/constants";
import type { Transaction, WebhookJob } from "../types";
import { signWebhook } from "./signature";
import { formatWib } from "./time";

export interface WebhookBody {
  readonly status_code: string;
  readonly transaction_id: string;
  readonly order_id: string;
  readonly gross_amount: number;
  readonly payment_type: PaymentType;
  readonly transaction_status: TransactionStatus;
  readonly transaction_time: string;
}

export interface BuildWebhookJobInput {
  readonly transaction: Transaction;
  /** Status yang akan dicapai. Payload dibentuk sebelum status transaksi benar-benar diubah. */
  readonly status: TransactionStatus;
  readonly now: number;
  readonly secretKey: string;
}

export function buildWebhookJob({ transaction, status, now, secretKey }: BuildWebhookJobInput): WebhookJob {
  const statusCode = STATUS_CODES[status];
  const body: WebhookBody = {
    status_code: statusCode,
    transaction_id: transaction.transaction_id,
    order_id: transaction.order_id,
    gross_amount: transaction.gross_amount,
    payment_type: transaction.payment_type,
    transaction_status: status,
    transaction_time: formatWib(now),
  };

  return {
    id: randomUUID(),
    transaction_id: transaction.transaction_id,
    callback_url: transaction.callback_url,
    body: JSON.stringify(body),
    signature: signWebhook(
      { orderId: transaction.order_id, statusCode, grossAmount: transaction.gross_amount },
      secretKey,
    ),
    failures: 0,
  };
}
