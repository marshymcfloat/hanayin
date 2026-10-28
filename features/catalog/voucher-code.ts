import "server-only";
import crypto from "crypto";
export const VOUCHER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const VOUCHER_CODE_MAX_ATTEMPTS = 10;
export function generateVoucherSuffix() {
  let output = "";
  for (let i = 0; i < 6; i += 1) output += VOUCHER_CODE_ALPHABET[crypto.randomInt(VOUCHER_CODE_ALPHABET.length)];
  return output;
}
