/**
 * Builds a dynamic QRIS payload following the EMVCo Merchant-Presented QR spec.
 * Every field is TLV encoded (two-digit tag, two-digit length, value) and the payload
 * ends with a CRC-16/CCITT-FALSE checksum in tag 63.
 */

const NMID = "ID1025000000001";
const MERCHANT_CATEGORY_CODE = "5812";
const CURRENCY_IDR = "360";
const COUNTRY_CODE = "ID";
const POSTAL_CODE = "12190";
const MAX_BILL_NUMBER_LENGTH = 25;

export interface QrisInput {
  readonly orderId: string;
  readonly amount: number;
  readonly merchantName: string;
  readonly merchantCity: string;
}

function tlv(tag: string, value: string): string {
  if (value.length > 99) {
    throw new RangeError(`Value for tag ${tag} exceeds 99 characters.`);
  }
  return `${tag}${value.length.toString().padStart(2, "0")}${value}`;
}

export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function toBillNumber(orderId: string): string {
  return orderId.replace(/[^A-Za-z0-9]/g, "").slice(0, MAX_BILL_NUMBER_LENGTH);
}

export function buildQrisPayload(input: QrisInput): string {
  const merchantAccount = tlv("00", "ID.CO.QRIS.WWW") + tlv("01", NMID);
  const additionalData = tlv("01", toBillNumber(input.orderId));

  const body =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", merchantAccount) +
    tlv("52", MERCHANT_CATEGORY_CODE) +
    tlv("53", CURRENCY_IDR) +
    tlv("54", String(input.amount)) +
    tlv("58", COUNTRY_CODE) +
    tlv("59", input.merchantName) +
    tlv("60", input.merchantCity) +
    tlv("61", POSTAL_CODE) +
    tlv("62", additionalData) +
    "6304";

  return body + crc16(body);
}
