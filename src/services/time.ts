import { WIB_OFFSET_MS } from "../config/constants";

/** Memformat epoch milidetik ke format `YYYY-MM-DD HH:mm:ss` dalam WIB. */
export function formatWib(epochMs: number): string {
  return new Date(epochMs + WIB_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}
