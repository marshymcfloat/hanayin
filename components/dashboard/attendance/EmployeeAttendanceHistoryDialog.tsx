"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Employee, EmployeeAttendance } from "@/prisma/generated/prisma/client";
import { getEmployeeAttendanceHistory } from "@/features/workforce/actions/attendance-admin";
import { format, isSameDay } from "date-fns";
import { Loader2, Clock, Calendar as CalendarIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface EmployeeAttendanceHistoryDialogProps {
  employee: (Employee & { user: { name: string } }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeAttendanceHistoryDialog({
  employee,
  open,
  onOpenChange,
}: EmployeeAttendanceHistoryDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );

  const { data: historyResult, isFetching } = useQuery({
    queryKey: ["employeeAttendanceHistory", employee?.id],
    queryFn: async () => {
      if (!employee) return { success: false as const, data: [] };
      return getEmployeeAttendanceHistory(employee.id);
    },
    enabled: open && !!employee,
    staleTime: 60 * 1000,
  });

  const history: EmployeeAttendance[] =
    historyResult?.success && historyResult.data ? historyResult.data : [];
  const loading = open && !!employee && isFetching;

  const getDayData = (date: Date) => {
    return history.find((h) => isSameDay(new Date(h.date), date));
  };

  const getModifiers = () => {
    const modifiers: Record<string, Date[]> = {
      present: [],
      late: [],
      absent: [],
      leave: [],
      off: [],
    };

    history.forEach((h) => {
      const date = new Date(h.date);
      const status = h.status.toLowerCase();
      if (modifiers[status]) {
        modifiers[status].push(date);
      }
    });

    return modifiers;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-4xl! max-w-[95vw] overflow-y-auto p-0 md:h-[60vh]! h-[95vh]! flex flex-col md:flex-row gap-0 border-0 shadow-2xl rounded-3xl">
        <div className="flex-1 flex flex-col p-8 border-r border-zinc-100 bg-white">
          <DialogHeader className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                {employee?.user.name.charAt(0)}
              </div>
              <div className="flex flex-col text-left">
                <DialogTitle className="text-xl font-bold text-zinc-900 tracking-tight">
                  Attendance History
                </DialogTitle>
                <DialogDescription className="text-zinc-500 font-medium">
                  {employee?.user.name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex flex-col items-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="p-4 border border-zinc-100 rounded-2xl shadow-sm bg-white"
              classNames={{
                day_selected:
                  "bg-zinc-900 text-white hover:bg-zinc-800 focus:bg-zinc-900",
                day_today: "bg-zinc-100 text-zinc-900 font-bold",
              }}
              modifiers={getModifiers()}
              modifiersClassNames={{
                present:
                  "bg-emerald-100 text-emerald-700 font-semibold hover:bg-emerald-200",
                late: "bg-amber-100 text-amber-700 font-semibold hover:bg-amber-200",
                absent:
                  "bg-rose-100 text-rose-700 font-semibold hover:bg-rose-200",
                leave:
                  "bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200",
                off: "bg-zinc-100 text-zinc-400 decoration-zinc-400 line-through",
              }}
            />

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-[400px]">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100/50">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                <span className="text-xs font-semibold text-emerald-700">
                  Present
                </span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100/50">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm" />
                <span className="text-xs font-semibold text-amber-700">
                  Late
                </span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-50 border border-rose-100/50">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm" />
                <span className="text-xs font-semibold text-rose-700">
                  Absent
                </span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-100/50">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm" />
                <span className="text-xs font-semibold text-blue-700">
                  Leave
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full md:w-[360px] bg-zinc-50 border-l border-zinc-100 p-8 flex flex-col relative overflow-y-auto">
          <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
            <CalendarIcon className="w-64 h-64" />
          </div>

          <div className="mb-8 z-10">
            <h3 className="text-2xl font-bold text-zinc-900 tracking-tight mb-1">
              {selectedDate ? format(selectedDate, "MMMM d") : "Select Date"}
            </h3>
            <p className="text-zinc-500 font-medium">
              {selectedDate
                ? format(selectedDate, "EEEE, yyyy")
                : "View details"}
            </p>
          </div>

          <div className="flex-1 z-10">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
                <p className="text-sm text-zinc-400 font-medium">
                  Loading history...
                </p>
              </div>
            ) : selectedDate && getDayData(selectedDate) ? (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 fade-in">
                {/* Status Card */}
                <div
                  className={`p-5 rounded-2xl border shadow-sm ${
                    getDayData(selectedDate)?.status === "PRESENT"
                      ? "bg-emerald-500 border-emerald-400 text-white"
                      : getDayData(selectedDate)?.status === "LATE"
                        ? "bg-amber-500 border-amber-400 text-white"
                        : getDayData(selectedDate)?.status === "ABSENT"
                          ? "bg-rose-500 border-rose-400 text-white"
                          : getDayData(selectedDate)?.status === "LEAVE"
                            ? "bg-blue-500 border-blue-400 text-white"
                            : "bg-zinc-100 border-zinc-200 text-zinc-500"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium opacity-80 uppercase tracking-widest mb-1">
                        Status
                      </p>
                      <p className="text-2xl font-bold tracking-tight">
                        {getDayData(selectedDate)?.status}
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                      {getDayData(selectedDate)?.status === "PRESENT" && (
                        <Loader2
                          className="h-5 w-5 animate-spin"
                          style={{ animationDuration: "3s" }}
                        />
                      )}
                      {getDayData(selectedDate)?.status !== "PRESENT" && (
                        <div className="h-3 w-3 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Time Details */}
                <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100 text-zinc-400 mt-0.5">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-zinc-700">
                          Time In
                        </span>
                        {getDayData(selectedDate)?.time_in && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded uppercase">
                            Recorded
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-mono font-medium text-zinc-900">
                        {getDayData(selectedDate)?.time_in ? (
                          format(
                            new Date(getDayData(selectedDate)!.time_in!),
                            "hh:mm a",
                          )
                        ) : (
                          <span className="text-zinc-300">--:-- --</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="w-full h-px bg-zinc-100" />

                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100 text-zinc-400 mt-0.5">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-zinc-700">
                          Time Out
                        </span>
                        {getDayData(selectedDate)?.time_out && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded uppercase">
                            Recorded
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-mono font-medium text-zinc-900">
                        {getDayData(selectedDate)?.time_out ? (
                          format(
                            new Date(getDayData(selectedDate)!.time_out!),
                            "hh:mm a",
                          )
                        ) : (
                          <span className="text-zinc-300">--:-- --</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Map/Location Placeholder if needed, or just visual filler */}
              </div>
            ) : selectedDate ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 text-center">
                <div className="w-16 h-16 rounded-3xl bg-zinc-100 flex items-center justify-center mb-4">
                  <CalendarIcon className="h-8 w-8 text-zinc-300" />
                </div>
                <h4 className="text-zinc-900 font-semibold mb-1">
                  No Records Found
                </h4>
                <p className="text-xs text-zinc-500 max-w-[200px]">
                  There is no attendance record for <br />{" "}
                  <span className="font-medium text-zinc-700">
                    {format(selectedDate, "MMMM do")}
                  </span>
                  .
                </p>
              </div>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
