"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TimeSlot } from "@/lib/services/booking-availability";
import { Clock, Info } from "lucide-react";

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  value?: Date;
  onChange: (time: Date) => void;
  isLoading?: boolean;
  category?: string;
  businessHours?: { open_time: string; close_time: string } | null;
  disabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  alternativeSlots?: TimeSlot[];
}

export default function TimeSlotPicker({
  slots,
  value,
  onChange,
  isLoading = false,
  category,
  businessHours,
  disabled = false,
  emptyTitle = "No available slots for the selected services",
  emptyDescription = "No available providers for this day/time. Try a different day.",
  alternativeSlots = [],
}: TimeSlotPickerProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Select services to view available slots</p>
        <p className="text-sm">Time slots are disabled until then</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>{emptyTitle}</p>
        <p className="text-sm">{emptyDescription}</p>
        {alternativeSlots.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-foreground">Next available</p>
            <div className="flex flex-wrap justify-center gap-2">
              {alternativeSlots.slice(0, 4).map((slot) => (
                <Button
                  key={slot.startTime.toISOString()}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onChange(slot.startTime)}
                  className="h-8 px-2.5 text-xs"
                >
                  {new Date(slot.startTime).toLocaleString("en-US", {
                    timeZone: "Asia/Manila",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="space-y-3">
      {businessHours && category && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
          <Info className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-800">
            <span className="font-semibold capitalize">{category}</span> hours:{" "}
            {formatTime(businessHours.open_time)} -{" "}
            {formatTime(businessHours.close_time)}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 p-1 sm:grid-cols-3 lg:grid-cols-4 max-h-[300px] overflow-y-auto">
        {slots.map((slot) => {
          const isSelected =
            value && slot.startTime.getTime() === value.getTime();
          const totalAvailableEmployees = slot.availableEmployeeCount;
          const availabilityLevel =
            totalAvailableEmployees >= 3
              ? "high"
              : totalAvailableEmployees >= 1
                ? "medium"
                : "none";

          return (
            <Button
              key={slot.startTime.toISOString()}
              type="button"
              variant={isSelected ? "default" : "outline"}
              disabled={!slot.available}
              onClick={() => onChange(slot.startTime)}
              className={cn(
                "h-auto min-h-14 px-2 py-2.5 flex flex-col items-center justify-center gap-1.5 transition-all duration-200",
                !slot.available && "opacity-40 cursor-not-allowed bg-muted/50",
                isSelected
                  ? "shadow-md ring-2 ring-primary/20 ring-offset-1 scale-[1.02]"
                  : "hover:border-primary/50 hover:bg-primary/5 bg-card",
                availabilityLevel === "high" &&
                  !isSelected &&
                  "border-green-500/30 hover:border-green-500/60 hover:bg-green-50/10",
              )}
            >
              <span
                className={cn(
                  "font-bold text-sm tracking-tight",
                  isSelected ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {new Date(slot.startTime).toLocaleTimeString("en-US", {
                  timeZone: "Asia/Manila",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider font-medium flex items-center gap-1 text-center",
                  isSelected
                    ? "text-primary-foreground/80"
                    : availabilityLevel === "high"
                      ? "text-green-600"
                      : "text-muted-foreground",
                )}
              >
                {slot.availableEmployeeCount > 0
                  ? `${slot.availableEmployeeCount} ${
                      slot.availableEmployeeCount === 1 ? "Employee" : "Employees"
                    }`
                  : "Unavailable"}
              </span>
              <span
                className={cn(
                  "text-[9px] leading-none",
                  isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {totalAvailableEmployees} employee
                {totalAvailableEmployees === 1 ? "" : "s"} left - Guaranteed
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
