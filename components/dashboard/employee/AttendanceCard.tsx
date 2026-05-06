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
}

export default function AttendanceCard({
  employeeId,
  businessSlug,
  todayAttendance,
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

    fetchAttendance();
  }, [employeeId, calendarDate, todayAttendance]);

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
      async (error) => {
        console.error("Geolocation error:", error);

        if (process.env.NODE_ENV === "development") {
          toast.info("Dev Mode: Geolocation failed, using mock location.");
          const result = await clockInAction(employeeId, 0, 0, businessSlug);

          if (result.success) {
            toast.success("Clocked in successfully (Dev Bypass)!");
          } else {
            toast.error(result.error);
          }
          setLoading(false);
          return;
        }

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
    const result = await clockOutAction(employeeId);
    if (result.success) {
      toast.success("Clocked out successfully!");
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  const today = new Date();
  const dateLine = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      layout="position"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "flex h-full flex-col gap-5 relative",
        className,
      )}
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
          {showCalendar ? <MapPin className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
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
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
