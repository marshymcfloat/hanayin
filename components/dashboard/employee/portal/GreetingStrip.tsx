"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * GreetingStrip — top of the employee portal.
 *
 * Layout:
 *   [Avatar] [Greeting + role pill]    [right-actions slot]
 *
 * Greeting is time-aware ("Good morning" / "afternoon" / "evening")
 * keyed off the local clock at mount. The first name is extracted
 * from the full display name with a graceful fallback.
 *
 * Role pill renders the supplied label (e.g. "Manager Portal") next
 * to a small status dot; visual-only, non-interactive.
 *
 * Right-actions is a slot — the parent supplies the booking dialog,
 * gift-card claim dialog, account dropdown, etc. Keeps this strip
 * agnostic of context-specific buttons.
 */
export interface GreetingStripProps {
  /** Display name of the signed-in employee. */
  name: string | null | undefined;
  /** "Manager Portal" / "Cashier Portal" / "Employee Portal" */
  roleLabel: string;
  /** Optional secondary line (e.g. business name + role). */
  subline?: React.ReactNode;
  /** Right-hand action slot (BookingDialog, GiftCardClaimDialog, AccountDropdown). */
  actions?: React.ReactNode;
}

export function GreetingStrip({
  name,
  roleLabel,
  subline,
  actions,
}: GreetingStripProps) {
  const reduced = useReducedMotion();
  const firstName = pickFirstName(name);
  const greeting = greetingForHour(new Date().getHours());

  return (
    <motion.header
      initial={reduced ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 sm:gap-4",
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Avatar className="size-11 shrink-0 ring-1 ring-inset ring-primary/15 sm:size-12">
          <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
            {pickInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 leading-tight">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary ring-1 ring-inset ring-primary/15">
              <span className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-primary" />
              {roleLabel}
            </span>
          </span>
          <h1 className="mt-1.5 truncate text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">
            {greeting}, {firstName}.
          </h1>
          {subline ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
              {subline}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}
        </div>
      ) : null}
    </motion.header>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function greetingForHour(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function pickFirstName(full: string | null | undefined): string {
  if (!full) return "there";
  const trimmed = full.trim();
  if (!trimmed) return "there";
  const first = trimmed.split(/\s+/)[0];
  return first.length ? first : "there";
}

function pickInitials(full: string | null | undefined): string {
  if (!full) return "U";
  const trimmed = full.trim();
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
