"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Briefcase,
  CalendarCheck,
  ListTodo,
  PhilippinePeso,
  type LucideIcon,
} from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";

/**
 * HeroKpiGrid — the four-tile salary/served/queue/leaves strip at
 * the top of the employee portal.
 *
 * One tile (Salary) is the "hero" — primary-green gradient surface
 * with white text + grain highlight + count-up animation. The other
 * three are neutral white cards in matching chrome.
 *
 * Responsive matrix:
 *   < md  → 2x2 grid; hero spans both columns of the first row
 *   ≥ md  → single 4-column row, hero is just the first card
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
  leavesThisMonth: number;
}

export function HeroKpiGrid({
  salaryEstimate,
  salaryWindowLabel = "Since last payslip",
  servedToday,
  queuePending,
  leavesThisMonth,
}: HeroKpiGridProps) {
  const reduced = useReducedMotion();
  const animatedSalary = useCountUp(salaryEstimate, !reduced);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
      {/* Hero — Salary. Spans 2 columns on mobile, 1 on md+. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative isolate col-span-2 overflow-hidden rounded-3xl text-white",
          "md:col-span-1",
          "bg-gradient-to-br from-primary via-emerald-700 to-emerald-900",
          "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-20px_color-mix(in_oklch,var(--primary)_60%,transparent)]",
        )}
      >
        {/* Soft white highlight at top-right */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-10 -z-10 size-48 rounded-full bg-white/15 blur-3xl"
        />
        {/* Faint diagonal grid for depth */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_70%_60%_at_30%_30%,black_30%,transparent_100%)]"
        />

        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-50/85">
              {salaryWindowLabel}
            </p>
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
              <PhilippinePeso className="size-4" />
            </span>
          </div>
          <p className="mt-5 text-3xl font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[2.5rem]">
            {formatCurrency(animatedSalary)}
          </p>
          <p className="mt-3 text-xs text-emerald-100/85">
            Estimated salary this period
          </p>
        </div>
      </motion.div>

      {/* Three neutral tiles */}
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
      <NeutralKpiTile
        index={3}
        label="Leaves filed"
        shortLabel="Leaves"
        sub="This month"
        value={leavesThisMonth}
        icon={CalendarCheck}
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
}: {
  /** Used for staggered entrance — 0..3 */
  index: number;
  label: string;
  shortLabel: string;
  sub: string;
  value: number;
  icon: LucideIcon;
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
        "rounded-3xl border border-black/[0.06] bg-card p-5 sm:p-6",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        "transition-shadow hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-16px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </p>
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground sm:text-[2.5rem]">
        {value.toLocaleString()}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">{sub}</p>
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
