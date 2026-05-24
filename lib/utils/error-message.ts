// Shared helper for surfacing server errors in toasts.
//
// Most server actions return { success: false, error: "human msg" } --
// callers should just toast `result.error || fallback`. This helper is
// for the OTHER path: try/catch on an exception (network failure,
// unhandled throw from a transactional server action, etc.).
//
// The booking-form voucher bug was a classic example: the server
// threw `new Error("Invalid or expired voucher code")` from inside a
// transaction, and the caller's catch block swallowed it into a
// generic "Failed to create booking" toast. Operators had no idea
// the voucher was the cause.
//
// Behavior:
// - Free-form messages (anything with whitespace or lowercase) are
//   returned as-is. These are owner-facing server errors and should
//   render directly.
// - Typed codes (SCREAMING_SNAKE_CASE, e.g. "PAYMENT_FAILED") are
//   humanized and appended to the fallback: "Failed to save:
//   payment failed." This preserves intentional opacity for codes
//   whose rendering needs a design decision, while at least naming
//   the symbol so operators can grep for it.
// - Empty / non-Error inputs fall back to the caller's default.
export function extractClientErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message?.trim();
  if (!msg) return fallback;
  // SCREAMING_SNAKE_CASE — typed error code.
  if (/^[A-Z][A-Z0-9_]*$/.test(msg)) {
    return `${fallback}: ${msg.replaceAll("_", " ").toLowerCase()}.`;
  }
  return msg;
}
