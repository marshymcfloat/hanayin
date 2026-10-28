"use client";

import { RefreshCw } from "lucide-react";

const updatedFormatter = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

export function OwnerPreviewRefreshControl({
  label,
  isFetching,
  updatedAt,
  error,
  onRefresh,
  iconOnly = false,
}: {
  label: string;
  isFetching: boolean;
  updatedAt: number;
  error?: string | null;
  onRefresh: () => void;
  iconOnly?: boolean;
}) {
  const updateStatus = isFetching
    ? "Updating data"
    : updatedAt
      ? `Updated ${updatedFormatter.format(updatedAt)}`
      : "Not updated yet";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#696C67]">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        aria-label={`Refresh ${label}`}
        title={`${error ? `Retry ${label}` : `Refresh ${label}`} · ${updateStatus}`}
        className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[#DDE0D9] bg-white font-semibold text-[#20211F] outline-none transition-colors hover:bg-[#F5F6F3] focus-visible:ring-3 focus-visible:ring-[#72CF35]/35 disabled:cursor-wait disabled:opacity-60 ${iconOnly ? "min-w-11 px-0" : "px-3 sm:min-h-9"}`}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        {iconOnly ? null : isFetching ? "Refreshing…" : error ? "Retry" : "Refresh"}
      </button>
      <span role="status" aria-live="polite" className={iconOnly ? "sr-only" : undefined}>
        {updateStatus}
      </span>
      {error ? <span role="alert" className="font-semibold text-[#C74248]">{error}</span> : null}
    </div>
  );
}
