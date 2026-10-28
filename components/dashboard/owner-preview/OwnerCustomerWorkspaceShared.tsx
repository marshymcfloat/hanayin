"use client";

import type { ReactElement, ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export { WorkforceHeader as WorkspaceHeader, WorkforceKpi as WorkspaceKpi, PersonAvatar, StatusChip, panelClass } from "./OwnerWorkforcePreviewShared";

export type CustomerWorkspaceDestination = "customers" | "bookings" | "notifications";
export const actionClass = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-xs font-bold outline-none transition-colors duration-200 hover:bg-[#F1F2EF] focus-visible:ring-3 focus-visible:ring-[#72CF35] motion-reduce:transition-none";

export function CustomerWorkspaceShell({ businessSlug: _businessSlug, active: _active, children }: { businessSlug: string; active: CustomerWorkspaceDestination; children: ReactNode }) {
  return <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]"><div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">{children}</div></main>;
}

export function WorkspaceSearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="relative block w-full lg:w-72"><span className="sr-only">{label}</span><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#696C67]" aria-hidden="true" /><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} className="h-11 w-full rounded-[14px] border border-[#E1E3DE] bg-[#F8F9F6] pl-10 pr-4 text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/20" /></label>;
}

export function WorkspaceFilters<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{options.map((option) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={cn(actionClass, "flex-[1_1_auto] sm:flex-none", value === option ? "bg-[#20211F] text-white hover:bg-[#343633]" : "bg-[#F1F2EF] text-[#696C67] hover:text-[#20211F]")}>{option}</button>)}</div>;
}

export function WorkspaceEmpty({ title, onReset }: { title: string; onReset: () => void }) {
  return <div className="grid min-h-56 place-items-center p-6 text-center"><div><Search className="mx-auto h-5 w-5 text-[#696C67]" aria-hidden="true" /><h3 className="mt-3 text-sm font-bold">{title}</h3><button type="button" onClick={onReset} className={cn(actionClass, "mt-2 text-[#3D791E]")}>Clear filters</button></div></div>;
}

export function WorkspaceDetails({ title, description, trigger, children }: { title: string; description: string; trigger: ReactElement; children: ReactNode }) {
  return <Dialog><DialogTrigger asChild>{trigger}</DialogTrigger><DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[24px] border-[#E1E3DE] bg-white p-0 font-[var(--font-body)] text-[#20211F] shadow-[0_28px_80px_rgba(23,24,23,0.24)] sm:max-w-[720px]">
    <DialogHeader className="relative shrink-0 border-b border-[#ECEEE9] p-5 pr-16 text-left"><DialogTitle className="text-lg font-bold tracking-tight">{title}</DialogTitle><DialogDescription className="mt-1 text-xs leading-5 text-[#696C67]">{description}</DialogDescription><DialogClose asChild><button type="button" aria-label="Close details" className={cn(actionClass, "absolute right-2 top-2 h-11 w-11 px-0")}><X className="h-4 w-4" aria-hidden="true" /></button></DialogClose></DialogHeader>
    <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5">{children}</div>
    <div className="flex shrink-0 justify-end border-t border-[#ECEEE9] bg-[#FAFBF8] px-5 py-3"><DialogClose asChild><button type="button" className={cn(actionClass, "border border-[#E1E3DE] bg-white")}>Close</button></DialogClose></div>
  </DialogContent></Dialog>;
}

export function WorkspaceField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#696C67]">{label}</dt><dd className="mt-1.5 break-words text-sm font-semibold">{children}</dd></div>;
}

export function WorkspaceMoney({ amount }: { amount: number }) {
  return <span className="inline-flex items-baseline gap-1 whitespace-nowrap font-mono font-semibold"><span className="text-[0.7em]">₱</span>{amount.toLocaleString("en-PH")}</span>;
}
