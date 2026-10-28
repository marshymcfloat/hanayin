"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Briefcase,
  ListTodo,
  PhilippinePeso,
  type LucideIcon,
} from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";

/**
 * HeroKpiGrid — salary, served, and queue tiles at the top of the
 * employee portal. Salary uses the charcoal hero surface; the other
 * tiles use white cards. The salary value retains its count-up animation.
 *
 * Responsive matrix:
 *   < xl  → two columns; hero spans the first row
 *   ≥ xl  → three columns in one row
 *
 * Labels shorten on `<sm` ("Served today" → "Served") via
 * hidden/sm:hidden swaps so the grid doesn't wrap awkwardly on
 * narrow phones.
 *
 * `prefers-reduced-motion` collapses the count-up to an instant set.
 */
interface HeroKpiGridProps {
  /** Estimated salary since the last payslip, in PHP. */
  salaryEstimate: number;
  /** Optional eyebrow caption like "Since Jan 12" or "This period". */
  salaryWindowLabel?: string;
  servedToday: number;
  queuePending: number;
}

export function HeroKpiGrid({
  salaryEstimate,
  salaryWindowLabel = "Since last payslip",
  servedToday,
  queuePending,
}: HeroKpiGridProps) {
  const reduced = useReducedMotion();
  const animatedSalary = useCountUp(salaryEstimate, !reduced);

  return (
    <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-3">
      {/* Hero — Salary. Spans 2 columns while the sidebar narrows the canvas. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative isolate col-span-2 overflow-hidden rounded-[28px] bg-[#20211F] text-white",
          "xl:col-span-1",
          "shadow-[0_18px_45px_rgba(32,33,31,0.13)]",
        )}
      >
        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
              {salaryWindowLabel}
            </p>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#B9F379] text-[#20211F]">
              <PhilippinePeso className="size-4" />
            </span>
          </div>
          <p className="mt-5 font-mono text-[clamp(1.75rem,2.3vw,2.5rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums">
            {formatCurrency(animatedSalary)}
          </p>
          <p className="mt-3 text-xs text-white/70">
            Estimated salary this period
          </p>
        </div>
      </motion.div>

      {/* Mobile: salary spans the first row; served and queue pair below. */}
      <NeutralKpiTile
        index={1}
        label="Served today"
        shortLabel="Served"
        sub="Completed services"
        value={servedToday}
        icon={Briefcase}
      />
      <NeutralKpiTile
        index={2}
        label="In queue"
        shortLabel="Queue"
        sub="Available to claim"
        value={queuePending}
        icon={ListTodo}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* NeutralKpiTile                                                             */
/* -------------------------------------------------------------------------- */

function NeutralKpiTile({
  index,
  label,
  shortLabel,
  sub,
  value,
  icon: Icon,
  className,
}: {
  /** Used for staggered entrance — 0..3 */
  index: number;
  label: string;
  shortLabel: string;
  sub: string;
  value: number;
  icon: LucideIcon;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
        delay: index * 0.04,
      }}
      className={cn(
        "rounded-[28px] border border-[#E7E9E4] bg-white p-5 sm:p-6",
        "shadow-[0_18px_45px_rgba(32,33,31,0.045)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#696C67]">
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </p>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EFF9E8] text-[#20211F]">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-5 font-mono text-3xl font-semibold leading-none tracking-[-0.04em] tabular-nums text-[#20211F] sm:text-[2.5rem]">
        {value.toLocaleString()}
      </p>
      <p className="mt-3 text-xs text-[#696C67]">{sub}</p>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* useCountUp                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cubic-eased count-up to `target`, finishing in ~800ms. Returns the
 * raw running value so consumers can format it however they want
 * (we use formatCurrency on the salary tile).
 *
 * If `animate` is false (e.g. prefers-reduced-motion) it sets the
 * value once and returns immediately.
 */
function useCountUp(target: number, animate: boolean): number {
  const [value, setValue] = React.useState(animate ? 0 : target);
  React.useEffect(() => {
    if (!animate) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);
  return value;
}
