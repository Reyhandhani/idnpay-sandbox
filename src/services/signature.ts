import { createHmac } from "node:crypto";

export interface SignableWebhook {
  readonly orderId: string;
  readonly statusCode: string;
  readonly grossAmount: number;
}

/**
 * Menghasilkan signature HMAC-SHA256 dalam format hex.
 * Pesan yang ditandatangani: order_id + status_code + gross_amount, dengan SECRET_KEY sebagai kunci.
 */
export function signWebhook(payload: SignableWebhook, secretKey: string): string {
  const message = `${payload.orderId}${payload.statusCode}${payload.grossAmount}`;
  return createHmac("sha256", secretKey).update(message, "utf8").digest("hex");
}
