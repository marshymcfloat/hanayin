import { cn, formatCurrency } from "@/lib/utils";
import { type ReactNode } from "react";

const PLATFORM_TIME_ZONE = "Asia/Manila";

const POSITIVE_STATUSES = new Set([
  "ACTIVE",
  "APPROVED",
  "CONVERTED",
  "PAID",
  "QUALIFIED",
  "REWARDED",
  "CONTACTED",
  "SUCCESS",
  "SETTLED",
]);

const WARNING_STATUSES = new Set([
  "TRIALING",
  "GRACE_PERIOD",
  "PENDING",
  "NEW",
  "OPEN",
  "DRAFT",
]);

const DANGER_STATUSES = new Set([
  "SUSPENDED",
  "CANCELED",
  "FAILED",
  "VOID",
  "EXPIRED",
  "REJECTED",
]);

// Platform UI Components — Shared styles and components for the admin
// platform. Brought into the portal language used by the employee
// dashboard and public booking surfaces:
//   - rounded-3xl card chrome with hairline `border-black/[0.06]`
//   - soft layered shadow recipe (`PortalCard` chrome)
//   - design tokens (--primary, --foreground, --muted-foreground) so
//     the admin shares the same green primary as the rest of the app
//   - status pills use `ring-1 ring-inset` instead of hard borders to
//     match the count-pill recipe used elsewhere

export const platformPanelClass =
  "rounded-3xl border border-black/[0.06] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.06)]";

export const platformTableContainerClass =
  "overflow-hidden overflow-x-auto rounded-3xl border border-black/[0.06] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

export const platformTableClass = "min-w-full text-left text-sm";
export const platformTableHeadClass =
  "bg-muted/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground border-b border-black/[0.06]";
export const platformTableCellClass =
  "px-4 py-3 align-top text-foreground whitespace-nowrap border-b border-black/[0.04] last:border-0";
export const platformTableWrapCellClass =
  "whitespace-normal break-words [overflow-wrap:anywhere]";

export const platformInputClass =
  "h-10 w-full rounded-xl border border-black/[0.06] bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15";

export const platformPrimaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-12px_color-mix(in_oklch,var(--primary)_50%,transparent)] transition hover:bg-primary/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none";

export const platformSecondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-full border border-black/[0.06] bg-card px-3 text-sm font-medium text-foreground transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none";

export const platformDangerButtonClass =
  "inline-flex h-9 items-center justify-center rounded-full border border-transparent bg-rose-500/10 px-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-500/20 transition hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:opacity-50 disabled:pointer-events-none dark:text-rose-300";

export function PlatformPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Platform admin
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function PlatformMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent";
}) {
  // "accent" tone uses the same green-gradient hero recipe as the
  // employee dashboard's salary tile — keeps the visual language
  // consistent across portals.
  if (tone === "accent") {
    return (
      <article
        className={cn(
          "relative isolate overflow-hidden rounded-3xl text-white p-5 sm:p-6",
          "bg-gradient-to-br from-primary via-emerald-700 to-emerald-900",
          "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-20px_color-mix(in_oklch,var(--primary)_60%,transparent)]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-10 -z-10 size-40 rounded-full bg-white/15 blur-3xl"
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-50/85">
          {label}
        </p>
        <p className="mt-4 text-3xl font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[2.5rem]">
          {value}
        </p>
      </article>
    );
  }
  return (
    <article
      className={cn(
        "rounded-3xl border border-black/[0.06] bg-card p-5 sm:p-6",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-4 text-3xl font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground sm:text-[2.5rem]">
        {value}
      </p>
    </article>
  );
}

export function PlatformStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const normalized = status.toUpperCase();
  // Portal pill recipe: ring-inset, no hard borders. Matches the
  // count-pill recipe used in PortalCardHeader, BookingDetailsDialog
  // status pills, and the booking success page service tags.
  const toneClass = POSITIVE_STATUSES.has(normalized)
    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15"
    : DANGER_STATUSES.has(normalized)
      ? "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/20 dark:text-rose-300"
      : WARNING_STATUSES.has(normalized)
        ? "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300"
        : "bg-muted text-muted-foreground ring-1 ring-inset ring-black/[0.06]";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border-transparent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] tabular-nums leading-none",
        toneClass,
        className,
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function formatPlatformDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    timeZone: PLATFORM_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPlatformDateTime(date: Date) {
  return date.toLocaleString("en-PH", {
    timeZone: PLATFORM_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatPhpFromCentavos(amountCentavos: number) {
  return formatCurrency(amountCentavos / 100);
}
