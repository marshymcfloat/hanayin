"use client";

import type { ReactNode } from "react";
import {
  CalendarClock,
  Pencil,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EditTarget = "services" | "schedule" | "customer";

interface BookingCheckoutReviewProps {
  serviceCount: number;
  schedule: string;
  staff: string;
  customer: string;
  contact: string;
  servicesContent: ReactNode;
  paymentControls: ReactNode;
  confirmation: ReactNode;
  action?: ReactNode;
  subtotal: number;
  discount?: number;
  balance?: number;
  dueNow: number;
  totalLabel: string;
  onEdit: (target: EditTarget) => void;
  presentation?: "default" | "owner";
}

const money = (value: number) =>
  `₱${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function BookingCheckoutReview({
  serviceCount,
  schedule,
  staff,
  customer,
  contact,
  servicesContent,
  paymentControls,
  confirmation,
  action,
  subtotal,
  discount = 0,
  balance,
  dueNow,
  totalLabel,
  onEdit,
  presentation = "default",
}: BookingCheckoutReviewProps) {
  const owner = presentation === "owner";
  const detailRows = [
    { icon: CalendarClock, label: schedule, meta: staff, target: "schedule" as const },
    { icon: UserRound, label: customer, meta: contact, target: "customer" as const },
  ];

  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card", owner && "rounded-[20px] border-[#E7E9E4] bg-[#FAFBF8]")} aria-label="Booking checkout review">
      <header className={cn("flex min-h-11 items-center justify-between border-b bg-muted/25 px-3 py-2", owner && "min-h-16 border-[#20211F] bg-[#20211F] px-4 py-3 text-white sm:px-5")}>
        <div className="flex items-center gap-2">
          <span className={cn(owner && "grid size-9 place-items-center rounded-xl bg-white/10 text-[#B9F379]")}><WalletCards className={cn("size-4 text-muted-foreground", owner && "text-[#B9F379]")} /></span>
          <h3 className={cn("text-sm font-semibold", owner && "text-base font-bold tracking-[-0.02em] text-white")}>Review &amp; payment</h3>
        </div>
        <span className={cn("rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums", owner && "bg-white/10 px-3 py-1 font-mono text-white")}>
          {serviceCount} selected
        </span>
      </header>

      <div className={cn("grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:divide-x lg:divide-border/70", owner && "lg:divide-[#E7E9E4]")}>
        <div className="divide-y divide-border/70">
          <div className={cn("px-3 py-2", owner && "bg-white px-4 py-3 sm:px-5")}>
            <div className="flex min-h-9 items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Services</span>
              <IconEdit label="Edit services" onClick={() => onEdit("services")} />
            </div>
            {servicesContent}
          </div>

          {detailRows.map(({ icon: Icon, label, meta, target }) => (
            <div key={target} className={cn("grid min-h-14 grid-cols-[1.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-3 py-2", owner && "min-h-16 grid-cols-[2.25rem_minmax(0,1fr)_2.75rem] bg-white px-4 sm:px-5")}>
              <span className={cn("grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground", owner && "size-9 rounded-xl bg-[#EFF9E8] text-[#315E18]")}><Icon className="size-3.5" /></span>
              <span className="min-w-0"><span className="block truncate text-xs font-semibold">{label}</span><span className="block truncate text-[11px] text-muted-foreground">{meta}</span></span>
              <IconEdit label={`Edit ${target}`} onClick={() => onEdit(target)} />
            </div>
          ))}
        </div>

        <div className={cn("space-y-3 border-t border-border/70 p-3 lg:border-t-0", owner && "border-[#E7E9E4] bg-[#FAFBF8] p-4 sm:p-5")}>
          {paymentControls}

          <div className="space-y-1.5 border-t pt-3 text-xs">
            <MoneyRow label="Subtotal" value={subtotal} />
            {discount > 0 && <MoneyRow label="Discount" value={-discount} />}
            {balance !== undefined && balance > 0 && <MoneyRow label="Pay later" value={balance} muted />}
          </div>
          {confirmation}
          <div className="flex items-end justify-between border-t pt-3"><span><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{totalLabel}</span><span className="text-[10px] text-muted-foreground">Final amount</span></span><strong className={cn("text-xl tabular-nums text-primary", owner && "font-mono text-2xl tracking-[-0.04em] text-[#20211F]")}>{money(dueNow)}</strong></div>
          {action}
        </div>
      </div>
    </section>
  );
}

function IconEdit({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick} className="size-11 cursor-pointer text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></Button>;
}

function MoneyRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return <div className={cn("flex items-center justify-between", muted && "text-muted-foreground")}><span>{label}</span><span className="tabular-nums">{value < 0 ? `−${money(Math.abs(value))}` : money(value)}</span></div>;
}
