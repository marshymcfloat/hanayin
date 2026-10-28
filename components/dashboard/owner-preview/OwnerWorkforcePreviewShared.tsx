import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkforcePreviewDestination = "employees" | "owners" | "payroll" | "attendance";

export const panelClass = "rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px]";

export function WorkforcePageShell({ businessSlug: _businessSlug, active: _active, children }: { businessSlug: string; active: WorkforcePreviewDestination; children: ReactNode }) {
  return <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]"><div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">{children}</div></main>;
}

export function WorkforceHeader({ businessSlug, businessName, eyebrow, title, description, action }: { businessSlug: string; businessName: string; eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <Link href={`/owner-dashboard-preview/${businessSlug}`} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#696C67] outline-none transition-colors hover:text-[#20211F] focus-visible:ring-3 focus-visible:ring-[#72CF35]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Dashboard</Link>
      <p className="text-sm font-semibold text-[#696C67]">{businessName} · {eyebrow}</p>
      <h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#696C67] sm:text-base">{description}</p>
    </div>
    {action}
  </header>;
}

export function WorkforceKpi({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: "lime" | "dark" | "coral" | "neutral" }) {
  const currency = value.startsWith("₱");
  const tones = {
    lime: "bg-[#EFF9E8] text-[#4D8F24]",
    dark: "bg-[#20211F] text-white",
    coral: "bg-[#FFF0F0] text-[#D94850]",
    neutral: "bg-[#F1F2EF] text-[#696C67]",
  };
  return <article className={cn(panelClass, "min-w-0 p-4 sm:p-5")}>
    <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-[#696C67]">{label}</p><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[12px]", tones[tone])}><Icon className="h-4 w-4" aria-hidden="true" /></span></div>
    <p className="mt-4 break-words font-mono text-[clamp(1.45rem,2.2vw,2rem)] font-semibold leading-none tracking-[-0.055em]">{currency && <span className="mr-1 align-[0.18em] text-[0.48em] tracking-normal">₱</span>}{currency ? value.slice(1) : value}</p>
    <p className="mt-2 text-[11px] leading-4 text-[#696C67]">{detail}</p>
  </article>;
}

export function StatusChip({ children, tone = "neutral" }: { children: ReactNode; tone?: "positive" | "warning" | "negative" | "neutral" }) {
  const tones = {
    positive: "bg-[#EFF9E8] text-[#3D791E]",
    warning: "bg-[#F5F2E8] text-[#75621F]",
    negative: "bg-[#FFF0F0] text-[#C74248]",
    neutral: "bg-[#F1F2EF] text-[#696C67]",
  };
  return <span className={cn("inline-flex min-h-7 items-center rounded-full px-2.5 text-[10px] font-bold", tones[tone])}>{children}</span>;
}

export function PersonAvatar({ name, tone = "lime" }: { name: string; tone?: "lime" | "dark" | "neutral" | "coral" }) {
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const tones = { lime: "bg-[#EFF9E8] text-[#3D791E]", dark: "bg-[#20211F] text-white", neutral: "bg-[#ECEEE9] text-[#555852]", coral: "bg-[#FFF0F0] text-[#C74248]" };
  return <span aria-hidden="true" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[13px] font-mono text-xs font-bold", tones[tone])}>{initials}</span>;
}
