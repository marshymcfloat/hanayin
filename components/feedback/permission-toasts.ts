/**
 * Standardized permission / error toasts.
 *
 * The dashboard already uses `sonner` for toast notifications. These
 * helpers wrap it so every action handler reports denial and generic
 * errors with consistent copy and severity. Server actions return
 * `{ success: false, error: "..." }`; the UI maps known error strings
 * to the appropriate toast.
 *
 * @example
 *   const result = await someAction(...);
 *   if (!result.success) {
 *     if (result.error === "Forbidden") {
 *       return showForbiddenToast({ action: "modify this booking" });
 *     }
 *     return showGenericErrorToast(result.error);
 *   }
 */

import { toast } from "sonner";

/**
 * Toast for a permission-denied response from a server action.
 * Always polite, never leaks raw internal strings.
 */
export function showForbiddenToast(options?: {
  /** What the user was trying to do, in present-tense ("modify this booking"). */
  action?: string;
  /** Override the default body. */
  description?: string;
}) {
  const action = options?.action;
  const description =
    options?.description ??
    (action
      ? `You don't have permission to ${action}. Ask your owner or manager if you need access.`
      : "You don't have permission to do that. Ask your owner or manager if you need access.");

  toast.error("Permission needed", { description });
}

/**
 * Generic error toast for an unexpected failure response from a server
 * action. Keeps the message short — long backend strings get truncated
 * to keep the toast readable.
 */
export function showGenericErrorToast(error?: string) {
  const description = truncate(error ?? "Something went wrong. Please try again.", 200);
  toast.error("Couldn't complete that", { description });
}

/**
 * Map a server action's error string to the right toast. Use this when
 * a handler doesn't need to branch on specific cases.
 */
export function showActionErrorToast(
  error: string | undefined,
  options?: { action?: string },
) {
  if (error === "Forbidden") {
    showForbiddenToast({ action: options?.action });
    return;
  }
  if (error === "Unauthorized") {
    toast.error("Please sign in", {
      description: "Your session expired. Sign in again to continue.",
    });
    return;
  }
  showGenericErrorToast(error);
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1).trimEnd()}…`;
}
