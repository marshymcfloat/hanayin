"use client";

import { cn } from "@/lib/utils";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";

interface AttendanceRecord {
  date: Date | string;
  status: string;
  time_in?: Date | string | null;
  time_out?: Date | string | null;
}

interface AttendanceCalendarProps {
  attendanceRecords: AttendanceRecord[];
  currentDate?: Date;
  onMonthChange?: (date: Date) => void;
}

export default function AttendanceCalendar({
  attendanceRecords,
  currentDate = new Date(),
  onMonthChange,
}: AttendanceCalendarProps) {
  const [displayedMonth, setDisplayedMonth] = useState(
    startOfMonth(currentDate),
  );

  useEffect(() => {
    setDisplayedMonth(startOfMonth(currentDate));
  }, [currentDate]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(displayedMonth),
    end: endOfMonth(displayedMonth),
  });

  const getStatusColor = (day: Date) => {
    if (!isSameMonth(day, displayedMonth))
      return "text-foreground/30 bg-transparent";

    const record = attendanceRecords.find((r) =>
      isSameDay(new Date(r.date), day),
    );

    if (record) {
      switch (record.status) {
        case "PRESENT":
          return "bg-primary/10 text-primary border-primary/20";
        case "ABSENT":
          return "bg-destructive/10 text-destructive border-destructive/20";
        case "LATE":
          return "bg-amber-100/60 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40";
        case "OFF":
          return "bg-muted text-muted-foreground border-border";
        default:
          return "bg-foreground/[0.02] text-foreground border-black/[0.05]";
      }
    }

    if (isToday(day)) {
      return "bg-primary/15 text-primary font-bold border-primary/30 ring-1 ring-inset ring-primary/30";
    }

    return "bg-foreground/[0.02] text-foreground/60 border-transparent hover:bg-primary/[0.04]";
  };

  const nextMonth = () => {
    const newDate = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() + 1,
      1,
    );
    setDisplayedMonth(newDate);
    onMonthChange?.(newDate);
  };

  const prevMonth = () => {
    const newDate = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() - 1,
      1,
    );
    setDisplayedMonth(newDate);
    onMonthChange?.(newDate);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold tracking-tight text-foreground">
          {format(displayedMonth, "MMMM yyyy")}
        </h4>
        <div className="flex gap-1">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>

      <div className="grid grid-cols-7 gap-2 flex-1">
        {daysInMonth.map((day, idx) => {
          // align first day
          const colStart = idx === 0 ? `col-start-${day.getDay() + 1}` : "";

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "aspect-square rounded-xl flex flex-col items-center justify-center text-xs border transition-colors",
                getStatusColor(day),
                colStart,
              )}
            >
              <span className="font-medium">{format(day, "d")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
