"use client";

import type { ReactNode } from "react";
import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CatalogDestination = "services" | "packages" | "vouchers" | "gift-cards";

export function CatalogPageFrame({
  businessSlug: _businessSlug,
  active: _active,
  children,
}: {
  businessSlug: string;
  active: CatalogDestination;
  children: ReactNode;
}) {
  return <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]"><div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">{children}</div></main>;
}

export function CatalogHeader({
  businessSlug,
  businessName,
  context,
  title,
  description,
  actionLabel,
  shortActionLabel,
  actionFocusKey,
  onAction,
  refreshControl,
}: {
  businessSlug: string;
  businessName: string;
  context: string;
  title: string;
  description: string;
  actionLabel: string;
  shortActionLabel: string;
  actionFocusKey: string;
  onAction: () => void;
  refreshControl?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <Link
          href={`/owner-dashboard-preview/${businessSlug}`}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#696C67] outline-none transition-colors hover:text-[#20211F] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
        </Link>
        <p className="text-sm font-semibold text-[#696C67]">
          {businessName} · {context}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3 sm:block">
          <h1 className="text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">
            {title}
          </h1>
          <button
            type="button"
            data-catalog-focus={actionFocusKey}
            onClick={onAction}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[#20211F] px-3.5 text-xs font-bold text-white outline-none transition-colors hover:bg-[#343633] active:translate-y-px focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 sm:hidden"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />{" "}
            {shortActionLabel}
          </button>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#696C67] sm:text-base">
          {description}
        </p>
        {refreshControl ? <div className="mt-3">{refreshControl}</div> : null}
      </div>
      <button
        type="button"
        data-catalog-focus={actionFocusKey}
        onClick={onAction}
        className="hidden min-h-11 cursor-pointer items-center justify-center gap-2 self-start rounded-full bg-[#20211F] px-5 text-sm font-bold text-white outline-none transition-colors hover:bg-[#343633] active:translate-y-px focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 sm:inline-flex lg:self-auto"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> {actionLabel}
      </button>
    </header>
  );
}

export function CatalogKpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  ring,
  currency = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "lime" | "dark" | "neutral" | "ring";
  ring?: number;
  currency?: boolean;
}) {
  const iconClass =
    tone === "dark"
      ? "bg-[#20211F] text-white"
      : tone === "neutral"
        ? "bg-[#F0F1EE] text-[#424440]"
        : "bg-[#EFF9E8] text-[#4D8F24]";
  const boundedRing = Math.max(0, Math.min(100, ring ?? 0));

  return (
    <article className="min-w-0 rounded-[26px] border border-white bg-white p-4 shadow-[0_14px_38px_rgba(32,33,31,0.045)] transition-[border-color,box-shadow] duration-200 hover:border-[#DDE0D9] hover:shadow-[0_18px_45px_rgba(32,33,31,0.075)] lg:p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-[12px]",
            iconClass,
          )}
        >
          <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
        </div>
        {tone === "ring" ? (
          <div
            role="img"
            aria-label={`${boundedRing}%`}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#72CF35 ${boundedRing * 3.6}deg,#E7E9E4 0)`,
            }}
          >
            <div className="grid h-7 w-7 place-items-center rounded-full bg-white font-mono text-[9px] font-bold text-[#4D8F24]">
              {Math.round(boundedRing)}
            </div>
          </div>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-[#F5F6F3] px-2 py-1 text-[10px] font-semibold text-[#62655F]">
            <ArrowUpRight
              className="h-3 w-3 text-[#4D8F24]"
              aria-hidden="true"
            />{" "}
            Live
          </span>
        )}
      </div>
      <p className="mt-4 text-xs font-semibold text-[#696C67]">{label}</p>
      <div className="mt-2 flex min-w-0 items-start">
        {currency ? (
          <span className="mr-1 mt-[3px] text-sm font-bold leading-none text-[#696C67]">
            ₱
          </span>
        ) : null}
        <span className="truncate font-mono text-[clamp(1.6rem,2.15vw,2.1rem)] font-semibold leading-none tracking-[-0.055em]">
          {value}
        </span>
      </div>
      <p
        className={cn(
          "mt-2.5 truncate text-[11px] font-medium",
          tone === "dark" || tone === "ring"
            ? "text-[#4D8F24]"
            : "text-[#696C67]",
        )}
      >
        {detail}
      </p>
    </article>
  );
}

export function CatalogEmptyState({
  title,
  description,
  filtered = false,
  onClear,
}: {
  title: string;
  description: string;
  filtered?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="grid min-h-64 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#F5F6F3] text-[#81847E]">
          <Search className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="mt-4 font-bold">{title}</h3>
        <p className="mt-1 text-sm text-[#696C67]">{description}</p>
        {filtered && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="mt-4 min-h-11 cursor-pointer rounded-full px-4 text-sm font-bold text-[#315E18] outline-none hover:bg-[#EFF9E8] focus-visible:ring-3 focus-visible:ring-[#72CF35]"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MutationNotice({
  notice,
}: {
  notice: { tone: "success" | "error"; text: string } | null;
}) {
  if (!notice) return null;
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={cn(
        "mt-3 rounded-[14px] px-3 py-2.5 text-sm font-semibold",
        notice.tone === "error"
          ? "bg-[#FFF0F0] text-[#C74248]"
          : "bg-[#EFF9E8] text-[#315E18]",
      )}
    >
      {notice.text}
    </p>
  );
}

export function CatalogCheckbox({
  id,
  checked,
  onChange,
  children,
  className,
  inputClassName,
  ariaLabel,
  disabled = false,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-w-0 cursor-pointer items-start gap-2",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn("h-4 w-4 shrink-0 accent-[#72CF35]", inputClassName)}
      />
      {children}
    </label>
  );
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-[24px] border-[#E1E3DE] bg-white p-0 shadow-[0_28px_80px_rgba(23,24,23,0.24)] sm:max-w-[460px]">
        <DialogHeader className="border-b border-[#ECEEE9] px-5 py-5 pr-14 text-left">
          <DialogTitle className="text-lg font-bold text-[#20211F]">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[13px] leading-5 text-[#696C67]">
            {description}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="mx-5 mt-4 rounded-[12px] bg-[#FFF0F0] px-3 py-2 text-sm font-semibold text-[#C74248]"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter className="border-t border-[#ECEEE9] bg-[#FAFBF8] px-5 py-3">
          <DialogClose asChild>
            <button
              type="button"
              disabled={pending}
              className="min-h-11 cursor-pointer rounded-full border border-[#DDE0D9] bg-white px-4 text-sm font-bold text-[#555852] disabled:cursor-wait disabled:opacity-60"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="min-h-11 cursor-pointer rounded-full bg-[#C74248] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
