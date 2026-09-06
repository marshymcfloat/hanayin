"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TimeSlot } from "@/lib/services/booking-availability";
import { Clock, Sunrise, Sun, Sunset } from "lucide-react";

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  value?: Date;
  onChange: (time: Date) => void;
  isLoading?: boolean;
  disabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  alternativeSlots?: TimeSlot[];
  /**
   * When true, hides the per-period "X open" aggregate pill — that
   * number leaks how booked-up the business is to anyone scraping
   * the public page. Per-slot capacity ("2 available" / "1 left") is
   * always shown because (a) the dot color already leaks the same
   * staffing tier and (b) honest numbers help customers pick
   * non-peak times.
   */
  isPublic?: boolean;
  /**
   * IANA timezone for display formatting (e.g. "Asia/Manila",
   * "America/Los_Angeles"). Comes from `BookingPolicy.timezone` which
   * mirrors `Business.timezone`. Defaults to the existing PH-locked
   * value so callers that haven't been migrated keep working.
   */
  timezone?: string;
}

const DEFAULT_TIMEZONE = "Asia/Manila";

type SlotPeriod = "morning" | "afternoon" | "evening";

const PERIOD_CONFIG: Record<
  SlotPeriod,
  { label: string; hours: string; Icon: React.ElementType; startHour: number; endHour: number }
> = {
  morning: {
    label: "Morning",
    hours: "Before 12 PM",
    Icon: Sunrise,
    startHour: 0,
    endHour: 12,
  },
  afternoon: {
    label: "Afternoon",
    hours: "12 PM – 5 PM",
    Icon: Sun,
    startHour: 12,
    endHour: 17,
  },
  evening: {
    label: "Evening",
    hours: "After 5 PM",
    Icon: Sunset,
    startHour: 17,
    endHour: 24,
  },
};

function getPeriod(date: Date, timezone: string): SlotPeriod {
  const hour = new Date(date).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const h = parseInt(hour, 10);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function formatSlotTime(date: Date, timezone: string) {
  return new Date(date).toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatAlternativeSlot(date: Date, timezone: string) {
  return new Date(date).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type AvailabilityLevel = "available" | "limited" | "unavailable";

function getAvailabilityLevel(slot: TimeSlot): AvailabilityLevel {
  if (!slot.available) return "unavailable";
  if (slot.availableEmployeeCount + slot.availableOwnerCount <= 1) return "limited";
  return "available";
}

function AvailabilityDot({ level, selected }: { level: AvailabilityLevel; selected: boolean }) {
  if (level === "unavailable") return null;
  return (
    <span
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full shrink-0",
        selected
          ? "bg-primary-foreground"
          : level === "limited"
            ? "bg-amber-500"
            : "bg-primary",
      )}
    />
  );
}

/**
 * Replaces the old binary "Available" / "Limited" label with a
 * concrete numeric anchor — the customer can tell the difference
 * between "3 available" (relaxed) and "1 left" (act now). Numeric capacity
 * is shown on every surface, public or staff: the dot color already
 * leaks the same staffing tier, and an honest number sets better
 * expectations than a vague label.
 */
function AvailabilityLabel({
  count,
  level,
  selected,
}: {
  count: number;
  level: AvailabilityLevel;
  selected: boolean;
}) {
  // Portal eyebrow type scale — matches PortalCardHeader (10px / 0.18em).
  const base = "text-[9px] font-semibold uppercase tracking-[0.1em] tabular-nums";
  if (count <= 1) {
    return (
      <span className={cn(base, selected ? "text-primary-foreground/85" : "text-amber-600")}>
        {/* "1 left" reads more urgently than "1 free" without being scammy. */}
        {count === 0 ? "Last spot" : "1 left"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        selected
          ? "text-primary-foreground/85"
          : level === "limited"
            ? "text-amber-600"
            : "text-primary",
      )}
    >
      {`${count} available`}
    </span>
  );
}

function SlotButton({
  slot,
  isSelected,
  onChange,
  timezone,
}: {
  slot: TimeSlot;
  isSelected: boolean;
  onChange: (time: Date) => void;
  timezone: string;
}) {
  const level = getAvailabilityLevel(slot);

  return (
    <Button
      key={slot.startTime.toISOString()}
      type="button"
      variant={isSelected ? "default" : "outline"}
      disabled={!slot.available}
      onClick={() => onChange(slot.startTime)}
      className={cn(
        "h-11 min-h-11 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 transition-colors duration-150 cursor-pointer",
        !slot.available && "opacity-40 cursor-not-allowed bg-muted/50 border-black/[0.04]",
        isSelected
          ? "bg-primary text-primary-foreground border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-16px_color-mix(in_oklch,var(--primary)_60%,transparent)]"
          : "bg-card border-black/[0.06] hover:border-primary/40 hover:bg-primary/[0.03]",
        !isSelected && level === "limited" && "border-amber-400/40 hover:border-amber-400/70",
      )}
    >
      <span
        className={cn(
          "whitespace-nowrap text-xs font-semibold tracking-[-0.01em] tabular-nums sm:text-sm",
          isSelected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {formatSlotTime(slot.startTime, timezone)}
      </span>
      {slot.available && (
        <span className="flex shrink-0 items-center gap-1">
          <AvailabilityDot level={level} selected={isSelected} />
          <AvailabilityLabel
            count={slot.availableEmployeeCount + slot.availableOwnerCount}
            level={level}
            selected={isSelected}
          />
        </span>
      )}
    </Button>
  );
}

function PeriodGroup({
  period,
  slots,
  value,
  onChange,
  timezone,
  showPeriodCount,
}: {
  period: SlotPeriod;
  slots: TimeSlot[];
  value?: Date;
  onChange: (time: Date) => void;
  timezone: string;
  showPeriodCount: boolean;
}) {
  const { label, hours, Icon } = PERIOD_CONFIG[period];
  const availableCount = slots.filter((s) => s.available).length;

  return (
    <div className="space-y-2">
      {/* Period header — mirrors PortalCardHeader recipe (icon chip + eyebrow + count pill).
          Kept flat (no extra card chrome) since this lives inside a PortalCard already. */}
      <div className="flex min-h-7 items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          <Icon className="size-3" />
        </span>
        <div className="flex min-w-0 items-baseline gap-2 leading-tight">
          <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">{label}</p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {hours}
          </p>
        </div>
        {/* Per-period count pill is staff-only by default — leaks scheduling
            pressure to anyone scraping the public page. The "Full" state is
            kept on both surfaces because hiding it just causes a wasted click
            on a period with zero slots. */}
        {(showPeriodCount || availableCount === 0) ? (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
              availableCount === 0
                ? "bg-muted text-muted-foreground"
                : availableCount <= 2
                  ? "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20"
                  : "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15",
            )}
          >
            {availableCount === 0 ? "Full" : `${availableCount} open`}
          </span>
        ) : null}
      </div>

      {/* Slot grid */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {slots.map((slot) => (
          <SlotButton
            key={slot.startTime.toISOString()}
            slot={slot}
            isSelected={!!value && slot.startTime.getTime() === value.getTime()}
            onChange={onChange}
            timezone={timezone}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(function TimeSlotPicker({
  slots,
  value,
  onChange,
  isLoading = false,
  disabled = false,
  emptyTitle = "No available slots for the selected services",
  emptyDescription = "No available providers for this day. Try a different date.",
  alternativeSlots = [],
  isPublic = false,
  timezone = DEFAULT_TIMEZONE,
}: TimeSlotPickerProps) {
  // Group slots by period
  const grouped = useMemo(() => {
    const groups: Record<SlotPeriod, TimeSlot[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const slot of slots) {
      groups[getPeriod(slot.startTime, timezone)].push(slot);
    }
    return groups;
  }, [slots, timezone]);

  const activePeriods = useMemo(
    () =>
      (["morning", "afternoon", "evening"] as SlotPeriod[]).filter(
        (p) => grouped[p].length > 0,
      ),
    [grouped],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Loading skeleton mimics period groups in portal chrome */}
        {[5, 4, 3].map((count, gi) => (
          <div key={gi} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-lg bg-muted animate-pulse" />
              <div className="h-3 w-28 rounded bg-muted animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="flex flex-col items-center text-center py-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          <Clock className="size-5" />
        </span>
        <p className="mt-3 text-sm text-muted-foreground">
          Select your services to see available times
        </p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          <Clock className="size-5" />
        </span>
        <p className="mt-3 text-sm font-semibold tracking-[-0.01em] text-foreground">
          {emptyTitle}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{emptyDescription}</p>

        {alternativeSlots.length > 0 && (
          <div className="mt-6 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Next available slots
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {alternativeSlots.slice(0, 4).map((slot) => (
                <Button
                  key={slot.startTime.toISOString()}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onChange(slot.startTime)}
                  // min-h-[44px] meets touch target requirement; rounded-full + primary tint
                  // matches the count-pill recipe used elsewhere in the portal.
                  className="min-h-[44px] rounded-full border-transparent bg-primary/5 px-3.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/15 hover:bg-primary/10 hover:text-primary cursor-pointer"
                >
                  {formatAlternativeSlot(slot.startTime, timezone)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activePeriods.map((period) => (
        <PeriodGroup
          key={period}
          period={period}
          slots={grouped[period]}
          value={value}
          onChange={onChange}
          timezone={timezone}
          showPeriodCount={!isPublic}
        />
      ))}
    </div>
  );
});
