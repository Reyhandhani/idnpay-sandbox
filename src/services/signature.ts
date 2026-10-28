import { createHmac } from "node:crypto";

export interface SignableWebhook {
  readonly orderId: string;
  readonly statusCode: string;
  readonly grossAmount: number;
}

/**
 * Returns an HMAC-SHA256 signature as hex.
 * The signed message is order_id + status_code + gross_amount, keyed by SECRET_KEY.
 */
export function signWebhook(payload: SignableWebhook, secretKey: string): string {
  const message = `${payload.orderId}${payload.statusCode}${payload.grossAmount}`;
  return createHmac("sha256", secretKey).update(message, "utf8").digest("hex");
}
