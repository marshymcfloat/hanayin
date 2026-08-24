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
}: BookingCheckoutReviewProps) {
  const detailRows = [
    { icon: CalendarClock, label: schedule, meta: staff, target: "schedule" as const },
    { icon: UserRound, label: customer, meta: contact, target: "customer" as const },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Booking checkout review">
      <header className="flex min-h-11 items-center justify-between border-b bg-muted/25 px-3 py-2">
        <div className="flex items-center gap-2">
          <WalletCards className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Review &amp; payment</h3>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums">
          {serviceCount} selected
        </span>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:divide-x lg:divide-border/70">
        <div className="divide-y divide-border/70">
          <div className="px-3 py-2">
            <div className="flex min-h-9 items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Services</span>
              <IconEdit label="Edit services" onClick={() => onEdit("services")} />
            </div>
            {servicesContent}
          </div>

          {detailRows.map(({ icon: Icon, label, meta, target }) => (
            <div key={target} className="grid min-h-14 grid-cols-[1.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-3 py-2">
              <span className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-3.5" /></span>
              <span className="min-w-0"><span className="block truncate text-xs font-semibold">{label}</span><span className="block truncate text-[11px] text-muted-foreground">{meta}</span></span>
              <IconEdit label={`Edit ${target}`} onClick={() => onEdit(target)} />
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border/70 p-3 lg:border-t-0">
          {paymentControls}

          <div className="space-y-1.5 border-t pt-3 text-xs">
            <MoneyRow label="Subtotal" value={subtotal} />
            {discount > 0 && <MoneyRow label="Discount" value={-discount} />}
            {balance !== undefined && balance > 0 && <MoneyRow label="Pay later" value={balance} muted />}
          </div>
          {confirmation}
          <div className="flex items-end justify-between border-t pt-3"><span><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{totalLabel}</span><span className="text-[10px] text-muted-foreground">Final amount</span></span><strong className="text-xl tabular-nums text-primary">{money(dueNow)}</strong></div>
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
