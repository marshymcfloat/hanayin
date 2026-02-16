import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  buildGrowthFlowQuery,
  type GrowthFlowContext,
  type GrowthFlowStep,
} from "./types";

type GrowthFlowChecklistProps = {
  businessSlug: string;
  flowContext?: GrowthFlowContext;
  activeStep: GrowthFlowStep;
  completedSteps: GrowthFlowStep[];
  nextAction: string;
  socialEnabled?: boolean;
  className?: string;
};

const STEPS: Array<{ step: GrowthFlowStep; label: string }> = [
  { step: 1, label: "Pick opportunity" },
  { step: 2, label: "Create or confirm event" },
  { step: 3, label: "Review and publish post" },
];

function getStepHref(
  businessSlug: string,
  step: GrowthFlowStep,
  context?: GrowthFlowContext,
) {
  if (step === 3) {
    return `/app/${businessSlug}/social-posts?${buildGrowthFlowQuery({
      step: 3,
      source: "sale-events",
      saleEventId: context?.saleEventId,
      socialPostId: context?.socialPostId,
    })}`;
  }

  return `/app/${businessSlug}/sale-events?${buildGrowthFlowQuery({
    step,
    source: context?.source || "dashboard",
    opportunityId: context?.opportunityId,
    saleEventId: context?.saleEventId,
    socialPostId: context?.socialPostId,
  })}`;
}

export function GrowthFlowChecklist({
  businessSlug,
  flowContext,
  activeStep,
  completedSteps,
  nextAction,
  socialEnabled = true,
  className,
}: GrowthFlowChecklistProps) {
  const steps = socialEnabled ? STEPS : STEPS.slice(0, 2);
  const totalSteps = socialEnabled ? 3 : 2;
  const displayActiveStep: GrowthFlowStep = socialEnabled
    ? activeStep
    : activeStep > 2
      ? 2
      : activeStep;

  return (
    <section
      className={cn(
        "rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-4",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            Growth Publishing Flow
          </p>
          <p className="text-xs text-zinc-600">Next action: {nextAction}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          Step {displayActiveStep} of {totalSteps}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {steps.map((item) => {
          const completed = completedSteps.includes(item.step);
          const active = displayActiveStep === item.step;
          return (
            <Link
              key={item.step}
              href={getStepHref(businessSlug, item.step, flowContext)}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                completed
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : active
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300",
              )}
            >
              {item.step}. {item.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
