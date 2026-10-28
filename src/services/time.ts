import { WIB_OFFSET_MS } from "../config/constants";

/** Formats epoch milliseconds as `YYYY-MM-DD HH:mm:ss` in WIB (UTC+7). */
export function formatWib(epochMs: number): string {
  return new Date(epochMs + WIB_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}
