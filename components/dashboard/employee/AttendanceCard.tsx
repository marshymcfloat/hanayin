"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  checkAttendanceStatusAction,
  getMonthlyAttendanceAction,
} from "@/features/workforce/actions/attendance";
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
  const loadingRef = useRef(false);
  const queryClient = useQueryClient();
  const initialDayKey = useRef(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));
  const [dayKey, setDayKey] = useState(initialDayKey.current);
  const [showCalendar, setShowCalendar] = useState(false);
  const [monthlyAttendance, setMonthlyAttendance] = useState<
    EmployeeAttendance[]
  >([]);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const attendanceQueryKey = ["staff-attendance", businessSlug, employeeId, dayKey] as const;
  const { data: confirmedAttendance = null } = useQuery({
    queryKey: attendanceQueryKey,
    queryFn: async () => {
      const result = await checkAttendanceStatusAction(employeeId);
      if (!result.success) throw new Error(result.error || "Unable to check attendance.");
      return result.data
        ? { time_in: result.data.time_in, time_out: result.data.time_out }
        : null;
    },
    initialData: dayKey === initialDayKey.current ? todayAttendance : undefined,
    refetchInterval: loading ? false : 30_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDayKey(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const isClockedIn = !!confirmedAttendance?.time_in && !confirmedAttendance.time_out;
  const isClockedOut = !!confirmedAttendance?.time_out;

  const beginClockAction = () => {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    setLoading(true);
    return true;
  };
  const finishClockAction = () => {
    loadingRef.current = false;
    setLoading(false);
  };

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const result = await getMonthlyAttendanceAction(
          employeeId,
          calendarDate.getFullYear(),
          calendarDate.getMonth(),
        );
        if (result.success && result.data) {
          setMonthlyAttendance(result.data);
        }
      } catch {
        toast.error("Unable to load attendance history. Please try again.");
      }
    };

    if (!compact) fetchAttendance();
  }, [compact, employeeId, calendarDate, confirmedAttendance]);

  const handleClockIn = async () => {
    if (!beginClockAction()) return;

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      finishClockAction();
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    try {
      navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await queryClient.cancelQueries({ queryKey: attendanceQueryKey });
          const { latitude, longitude } = position.coords;
          const result = await clockInAction(employeeId, latitude, longitude, businessSlug);
          if (result.success) {
            queryClient.setQueryData(attendanceQueryKey, {
              time_in: result.data.time_in,
              time_out: result.data.time_out,
            });
            toast.success("Clocked in successfully!");
          } else {
            toast.error(result.error);
          }
        } catch {
          toast.error("Unable to start shift. Please try again.");
        } finally {
          finishClockAction();
          void queryClient.invalidateQueries({ queryKey: attendanceQueryKey }).catch(() => {
            toast.error("Unable to refresh attendance. Please retry.");
          });
        }
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
        finishClockAction();
      },
      options,
      );
    } catch {
      toast.error("Unable to request your location. Please try again.");
      finishClockAction();
    }
  };

  const handleClockOut = async () => {
    if (!beginClockAction()) return;

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      finishClockAction();
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          await queryClient.cancelQueries({ queryKey: attendanceQueryKey });
          const result = await clockOutAction(employeeId, coords.latitude, coords.longitude, businessSlug);
          if (result.success) {
            queryClient.setQueryData(attendanceQueryKey, {
              time_in: result.data.time_in,
              time_out: result.data.time_out,
            });
            toast.success("Clocked out successfully!");
          } else {
            toast.error(result.error);
          }
        } catch {
          toast.error("Unable to end shift. Please try again.");
        } finally {
          finishClockAction();
          void queryClient.invalidateQueries({ queryKey: attendanceQueryKey }).catch(() => {
            toast.error("Unable to refresh attendance. Please retry.");
          });
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Enable it to end your shift."
            : "Unable to verify your workplace location.",
        );
        finishClockAction();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    } catch {
      toast.error("Unable to request your location. Please try again.");
      finishClockAction();
    }
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
        {isClockedIn && confirmedAttendance?.time_in ? (
          <p className="text-center text-xs text-muted-foreground">
            Started{" "}
            {new Date(confirmedAttendance.time_in).toLocaleTimeString("en-US", {
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
                  {confirmedAttendance?.time_in && (
                    <span className="font-medium text-muted-foreground ml-1">
                      ·{" "}
                      {new Date(confirmedAttendance.time_in).toLocaleTimeString(
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
            "size-11 rounded-full inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer",
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
