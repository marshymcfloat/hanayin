"use client";

/**
 * Small colored pill that labels an actor's effective role across the
 * dashboard (audit trails, request cards, queue rows). One component so
 * a palette tweak is one edit.
 */

import { cn } from "@/lib/utils";

export type RoleBadgeVariant = "OWNER" | "MANAGER" | "CASHIER" | "STAFF";

const VARIANT_CLASSES: Record<RoleBadgeVariant, string> = {
  // Owner: deep amber — distinct from any staff role.
  OWNER: "bg-amber-100 text-amber-900 border-amber-200",
  // Manager: indigo — second-most-authority signal.
  MANAGER: "bg-indigo-100 text-indigo-900 border-indigo-200",
  // Cashier: emerald — settlement / money-handling cue.
  CASHIER: "bg-emerald-100 text-emerald-900 border-emerald-200",
  // Staff: zinc — neutral default.
  STAFF: "bg-zinc-100 text-zinc-800 border-zinc-200",
};

const VARIANT_LABEL: Record<RoleBadgeVariant, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  STAFF: "Staff",
};

export function RoleBadge({
  variant,
  className,
  label,
}: {
  variant: RoleBadgeVariant;
  className?: string;
  /** Override the label text. Defaults to a sentence-cased role name. */
  label?: string;
}) {
  return (
    <span
      data-role={variant}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {label ?? VARIANT_LABEL[variant]}
    </span>
  );
}

/**
 * Convenience derivation: turn a (role, staffProfile) pair into the
 * badge variant the rest of the UI uses.
 */
export function deriveRoleBadgeVariant(input: {
  role: "OWNER" | "EMPLOYEE";
  staffProfile?: "STAFF" | "MANAGER" | "CASHIER" | null;
}): RoleBadgeVariant {
  if (input.role === "OWNER") return "OWNER";
  return input.staffProfile ?? "STAFF";
}
