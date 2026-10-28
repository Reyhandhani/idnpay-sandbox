import { randomInt } from "node:crypto";
import {
  type Bank,
  EWALLET_DEEPLINK_SCHEMES,
  type EwalletProvider,
  VA_LENGTH,
  VA_PREFIXES,
} from "../config/constants";

function randomDigits(length: number): string {
  let digits = "";
  for (let i = 0; i < length; i++) {
    digits += randomInt(0, 10).toString();
  }
  return digits;
}

export function generateVirtualAccountNumber(bank: Bank): string {
  const prefix = VA_PREFIXES[bank];
  return prefix + randomDigits(VA_LENGTH - prefix.length);
}

export function buildEwalletDeeplink(provider: EwalletProvider, transactionId: string): string {
  return `${EWALLET_DEEPLINK_SCHEMES[provider]}?ref=${encodeURIComponent(transactionId)}`;
}
