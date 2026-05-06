"use client";

import * as React from "react";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * PortalCard — shared chrome primitive used by every card in the
 * employee portal bento grid. One file, one rounded-3xl surface, one
 * hairline border, one soft shadow. Anything that needs to render a
 * card-shaped surface goes through here so we never re-derive the
 * same styles inline.
 *
 * Composition: PortalCard / PortalCardHeader / PortalCardBody —
 * mirroring shadcn's Card primitive split. Body opts into internal
 * scroll via `scrollable`.
 */

export const PortalCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function PortalCard({ className, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-3xl border border-black/[0.06] bg-card",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.06)]",
        "flex flex-col overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export interface PortalCardHeaderProps {
  /** Tiny mono-uppercase label above the title. Optional. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Pill-style count chip rendered next to the title. */
  count?: number;
  icon?: LucideIcon;
  /** Right-aligned content (links, buttons, dropdowns). */
  action?: React.ReactNode;
  className?: string;
}

export function PortalCardHeader({
  eyebrow,
  title,
  count,
  icon: Icon,
  action,
  className,
}: PortalCardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0 leading-tight">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="mt-0.5 flex items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
              {title}
            </h3>
            {count != null ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                {count}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export const PortalCardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { scrollable?: boolean }
>(function PortalCardBody({ className, children, scrollable, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex-1 min-h-0 px-5 pb-5 sm:px-6 sm:pb-6",
        scrollable && "overflow-y-auto overscroll-contain no-scrollbar",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
