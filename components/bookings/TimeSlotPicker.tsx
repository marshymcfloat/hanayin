"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TimeSlot } from "@/lib/services/booking-availability";
import { Clock, Sunrise, Sun, Sunset, ChevronDown } from "lucide-react";

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  value?: Date;
  onChange: (time: Date) => void;
  isLoading?: boolean;
  disabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  alternativeSlots?: TimeSlot[];
  /** When true, hides availability indicators (employee counts). Always hide for public-facing forms. */
  isPublic?: boolean;
}

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

function getPeriod(date: Date): SlotPeriod {
  const hour = new Date(date).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: false,
  });
  const h = parseInt(hour, 10);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function formatSlotTime(date: Date) {
  return new Date(date).toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatAlternativeSlot(date: Date) {
  return new Date(date).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
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
  if (slot.availableEmployeeCount <= 1) return "limited";
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
            : "bg-emerald-500",
      )}
    />
  );
}

function AvailabilityLabel({
  level,
  selected,
}: {
  level: AvailabilityLevel;
  selected: boolean;
}) {
  const base = "text-[10px] uppercase tracking-wider font-medium";
  if (level === "limited") {
    return (
      <span className={cn(base, selected ? "text-primary-foreground/80" : "text-amber-600")}>
        Limited
      </span>
    );
  }
  return (
    <span className={cn(base, selected ? "text-primary-foreground/80" : "text-emerald-600")}>
      Available
    </span>
  );
}

function SlotButton({
  slot,
  isSelected,
  onChange,
}: {
  slot: TimeSlot;
  isSelected: boolean;
  onChange: (time: Date) => void;
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
        // min-h-[52px] satisfies 44px touch target requirement with padding
        "h-auto min-h-[52px] px-2 py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer",
        !slot.available && "opacity-40 cursor-not-allowed bg-muted/50",
        isSelected
          ? "shadow-md ring-2 ring-primary/20 ring-offset-1"
          : "hover:border-primary/50 hover:bg-primary/5 bg-card",
        !isSelected && level === "available" && "border-emerald-500/30 hover:border-emerald-500/60",
        !isSelected && level === "limited" && "border-amber-400/40 hover:border-amber-400/70",
      )}
    >
      <span
        className={cn(
          "font-bold text-sm tracking-tight",
          isSelected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {formatSlotTime(slot.startTime)}
      </span>
      {slot.available && (
        <span className="flex items-center gap-1">
          <AvailabilityDot level={level} selected={isSelected} />
          <AvailabilityLabel level={level} selected={isSelected} />
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
}: {
  period: SlotPeriod;
  slots: TimeSlot[];
  value?: Date;
  onChange: (time: Date) => void;
}) {
  const { label, hours, Icon } = PERIOD_CONFIG[period];
  const availableCount = slots.filter((s) => s.available).length;

  return (
    <div className="space-y-2">
      {/* Period header */}
      <div className="flex items-center gap-2 px-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{hours}</span>
        <span
          className={cn(
            "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            availableCount === 0
              ? "bg-muted text-muted-foreground"
              : availableCount <= 2
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200",
          )}
        >
          {availableCount === 0 ? "Full" : `${availableCount} open`}
        </span>
      </div>

      {/* Slot grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {slots.map((slot) => (
          <SlotButton
            key={slot.startTime.toISOString()}
            slot={slot}
            isSelected={!!value && slot.startTime.getTime() === value.getTime()}
            onChange={onChange}
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
}: TimeSlotPickerProps) {
  // Group slots by period
  const grouped = useMemo(() => {
    const groups: Record<SlotPeriod, TimeSlot[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const slot of slots) {
      groups[getPeriod(slot.startTime)].push(slot);
    }
    return groups;
  }, [slots]);

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
        {/* Loading skeleton mimics period groups */}
        {[5, 4, 3].map((count, gi) => (
          <div key={gi} className="space-y-2">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-[52px] rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Select your services to see available times</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium">{emptyTitle}</p>
        <p className="text-sm mt-0.5">{emptyDescription}</p>

        {alternativeSlots.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
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
                  // min-h-[44px] meets touch target requirement (was h-8 = 32px before)
                  className="min-h-[44px] px-3 text-xs cursor-pointer"
                >
                  {formatAlternativeSlot(slot.startTime)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {activePeriods.map((period) => (
        <PeriodGroup
          key={period}
          period={period}
          slots={grouped[period]}
          value={value}
          onChange={onChange}
        />
      ))}
    </div>
  );
});
