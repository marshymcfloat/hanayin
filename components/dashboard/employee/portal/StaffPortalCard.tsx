"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  PortalCard,
  PortalCardBody,
  type PortalCardHeaderProps,
} from "./PortalCard";

export const StaffPortalCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function StaffPortalCard({ className, ...props }, ref) {
  return (
    <PortalCard
      ref={ref}
      className={cn(
        "rounded-[28px] border-[#E7E9E4] bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)]",
        className,
      )}
      {...props}
    />
  );
});

export function StaffPortalCardHeader({
  eyebrow,
  title,
  count,
  icon: Icon,
  action,
  className,
}: PortalCardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pb-4 sm:pt-6", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#B9F379] text-[#20211F]">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0 leading-tight">
          {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#696C67]">{eyebrow}</p> : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold tracking-[-0.025em] text-[#20211F] sm:text-lg">{title}</h3>
            {count != null ? <span className="rounded-full bg-[#EFF9E8] px-2.5 py-1 text-[10px] font-bold tabular-nums text-[#20211F]">{count}</span> : null}
          </div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { PortalCardBody as StaffPortalCardBody };
