// Canonical voucher-code normalization. ALL read + write paths must
// funnel through this so a hand-typed lowercase suffix can never
// produce a code that verifies on the dialog but fails on submit.
// Lives outside lib/server actions/ because server-action files can
// only export async functions, and pure helpers don't need to be one.
export function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase();
}
