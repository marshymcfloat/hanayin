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

// Platform UI Components - Shared styles and components for the admin platform

export const platformPanelClass =
  "rounded-xl border border-stone-200 bg-white shadow-sm";

export const platformTableContainerClass =
  "overflow-hidden overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm";

export const platformTableClass = "min-w-full text-left text-sm";
export const platformTableHeadClass =
  "bg-stone-50 px-4 py-3 text-xs font-medium uppercase tracking-wider text-stone-500 border-b border-stone-200";
export const platformTableCellClass =
  "px-4 py-3 align-top text-stone-900 whitespace-nowrap border-b border-stone-100 last:border-0";
export const platformTableWrapCellClass =
  "whitespace-normal break-words [overflow-wrap:anywhere]";

export const platformInputClass =
  "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-500 focus:ring-1 focus:ring-stone-500";

export const platformPrimaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:opacity-50 disabled:pointer-events-none";

export const platformSecondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:opacity-50 disabled:pointer-events-none";

export const platformDangerButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50 disabled:pointer-events-none";

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
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-stone-500">{description}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
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
  return (
    <article
      className={cn(
        platformPanelClass,
        "p-5 flex flex-col justify-between h-full",
        tone === "accent" && "bg-stone-900 border-stone-900 text-white",
      )}
    >
      <p
        className={cn(
          "text-xs font-medium uppercase tracking-wider",
          tone === "accent" ? "text-stone-400" : "text-stone-500",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-4 text-3xl font-bold tracking-tight",
          tone === "accent" ? "text-white" : "text-stone-900",
        )}
      >
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
  const toneClass = POSITIVE_STATUSES.has(normalized)
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : DANGER_STATUSES.has(normalized)
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : WARNING_STATUSES.has(normalized)
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-stone-100 text-stone-700 border-stone-200";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
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
