"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Loader2,
  PlayCircle,
  StopCircle,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import {
  clockInAction,
  clockOutAction,
  getMonthlyAttendanceAction,
} from "@/lib/server actions/attendance";
import type { EmployeeAttendance } from "@/prisma/generated/prisma/client";
import AttendanceCalendar from "./AttendanceCalendar";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface AttendanceCardProps {
  employeeId: number;
  businessSlug: string;
  todayAttendance: {
    time_in: Date | null;
    time_out: Date | null;
  } | null;
  compact?: boolean;
}

export default function AttendanceCard({
  employeeId,
  businessSlug,
  todayAttendance,
  compact = false,
  className,
}: AttendanceCardProps & { className?: string }) {
  const [loading, setLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [monthlyAttendance, setMonthlyAttendance] = useState<
    EmployeeAttendance[]
  >([]);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const isClockedIn = !!todayAttendance?.time_in && !todayAttendance.time_out;
  const isClockedOut = !!todayAttendance?.time_out;

  useEffect(() => {
    const fetchAttendance = async () => {
      const result = await getMonthlyAttendanceAction(
        employeeId,
        calendarDate.getFullYear(),
        calendarDate.getMonth(),
      );
      if (result.success && result.data) {
        setMonthlyAttendance(result.data);
      }
    };

    if (!compact) fetchAttendance();
  }, [compact, employeeId, calendarDate, todayAttendance]);

  const handleClockIn = async () => {
    setLoading(true);

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const result = await clockInAction(
          employeeId,
          latitude,
          longitude,
          businessSlug,
        );

        if (result.success) {
          toast.success("Clocked in successfully!");
        } else {
          toast.error(result.error);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Geolocation error:", error);

        let errorMessage = "Unable to retrieve location.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage =
              "Location permission denied. Please enable it in browser settings or OS settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out. Please try again.";
            break;
        }
        toast.error(errorMessage);
        setLoading(false);
      },
      options,
    );
  };

  const handleClockOut = async () => {
    setLoading(true);

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const result = await clockOutAction(
          employeeId,
          coords.latitude,
          coords.longitude,
          businessSlug,
        );
        if (result.success) {
          toast.success("Clocked out successfully!");
        } else {
          toast.error(result.error);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Enable it to end your shift."
            : "Unable to verify your workplace location.",
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const today = new Date();
  const dateLine = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        {!isClockedOut ? (
          <Button
            onClick={isClockedIn ? handleClockOut : handleClockIn}
            disabled={loading}
            className={cn(
              "h-11 w-full rounded-xl text-sm font-bold cursor-pointer",
              isClockedIn
                ? "border border-amber-300 bg-amber-50 text-amber-900 shadow-none hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : isClockedIn ? (
              <StopCircle className="mr-2 size-4" />
            ) : (
              <PlayCircle className="mr-2 size-4" />
            )}
            {loading
              ? "Processing..."
              : isClockedIn
                ? "End Shift"
                : "Start Shift"}
          </Button>
        ) : (
          <p className="flex min-h-11 items-center justify-center rounded-xl bg-muted/50 text-sm font-semibold text-muted-foreground">
            Shift completed
          </p>
        )}
        {isClockedIn && todayAttendance?.time_in ? (
          <p className="text-center text-xs text-muted-foreground">
            Started{" "}
            {new Date(todayAttendance.time_in).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <motion.div
      layout="position"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn("flex h-full flex-col gap-5 relative", className)}
    >
      {/* Header row: date + status dot + calendar toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
            {dateLine}
          </p>
          {/* Inline status — flat, no nested chip */}
          <div className="mt-2 flex items-center gap-2">
            {isClockedOut ? (
              <>
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
                <span className="text-xs font-semibold text-muted-foreground">
                  Shift completed
                </span>
              </>
            ) : isClockedIn ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-xs font-semibold text-primary">
                  Clocked in
                  {todayAttendance?.time_in && (
                    <span className="font-medium text-muted-foreground ml-1">
                      ·{" "}
                      {new Date(todayAttendance.time_in).toLocaleTimeString(
                        "en-US",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-xs font-semibold text-muted-foreground">
                  Not started
                </span>
              </>
            )}
          </div>
        </div>
        <motion.button
          layout="position"
          onClick={() => setShowCalendar(!showCalendar)}
          aria-label={showCalendar ? "Hide calendar" : "Show calendar"}
          className={cn(
            "h-9 w-9 rounded-full inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer",
            showCalendar
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {showCalendar ? (
            <MapPin className="h-4 w-4" />
          ) : (
            <CalendarDays className="h-4 w-4" />
          )}
        </motion.button>
      </div>

      {/* Action button */}
      {!isClockedOut && (
        <Button
          onClick={isClockedIn ? handleClockOut : handleClockIn}
          disabled={loading}
          className={cn(
            "w-full h-12 rounded-xl text-sm font-bold transition-colors active:scale-[0.99] cursor-pointer",
            isClockedIn
              ? "border border-amber-300 bg-amber-50 text-amber-900 shadow-none hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : isClockedIn ? (
            <StopCircle className="w-4 h-4 mr-2" />
          ) : (
            <PlayCircle className="w-4 h-4 mr-2" />
          )}
          {loading
            ? "Processing..."
            : isClockedIn
              ? "End Shift"
              : "Start Shift"}
        </Button>
      )}

      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="border-t border-border pt-4 overflow-hidden"
          >
            <AttendanceCalendar
              attendanceRecords={monthlyAttendance}
              currentDate={calendarDate}
              onMonthChange={setCalendarDate}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
