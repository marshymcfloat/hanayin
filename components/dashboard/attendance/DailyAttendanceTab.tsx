"use client";

import { useState, useOptimistic, useTransition } from "react";
import { format, addDays, subDays, isSameDay } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar as CalendarIcon,
  Clock,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Employee,
  EmployeeAttendance,
  AttendanceStatus,
} from "@/prisma/generated/prisma/client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  updateAttendanceStatus,
  previewAttendanceImpactAction,
  type AttendanceImpactBooking,
} from "@/app/actions/attendance";

import { EmployeeAttendanceHistoryDialog } from "./EmployeeAttendanceHistoryDialog";
import { AttendanceImpactDialog } from "./AttendanceImpactDialog";

type AttendanceData = {
  employee: Employee & { user: { name: string } };
  attendance: EmployeeAttendance | null;
};

/**
 * Verb fragment used in the impact-confirmation dialog headline.
 * "Mark Anna as absent anyway" reads better than "Mark Anna as ABSENT
 * anyway"; this folds the enum to a friendly verb.
 */
function statusVerb(status: AttendanceStatus | undefined): string {
  switch (status) {
    case "ABSENT":
      return "absent";
    case "OFF":
      return "off";
    case "LEAVE":
      return "on leave";
    default:
      return "unavailable";
  }
}

interface DailyAttendanceTabProps {
  businessId: string;
  initialData: AttendanceData[];
  currentDate: Date;
}

export function DailyAttendanceTab({
  businessId,
  initialData,
  currentDate,
}: DailyAttendanceTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedEmployee, setSelectedEmployee] = useState<
    (Employee & { user: { name: string } }) | null
  >(null);

  // Optimistic data handling
  const [optimisticData, addOptimisticUpdate] = useOptimistic(
    initialData,
    (state, update: { employeeId: number; status: AttendanceStatus }) => {
      return state.map((item) => {
        if (item.employee.id === update.employeeId) {
          // Create optimistic attendance or update existing
          const baseAttendance = item.attendance || {
            id: 0,
            employee_id: update.employeeId,
            date: currentDate,
            time_in: null,
            time_out: null,
            location_verified: false,
            latitude: null,
            longitude: null,
            created_at: new Date(),
            updated_at: new Date(),
          };

          return {
            ...item,
            attendance: {
              ...baseAttendance,
              status: update.status,
            } as EmployeeAttendance,
          };
        }
        return item;
      });
    },
  );

  const handleDateChange = (newDate: Date) => {
    startTransition(() => {
      // Use ISO string for consistent parsing
      const dateString = newDate.toISOString();
      router.push(`?date=${dateString}`);
    });
  };

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  // Statuses that block this employee from serving bookings on the
  // target date. Transitioning into one of these orphans every booking
  // assigned to them â€” that's the moment we want to show the preview.
  const BLOCKING_STATUSES: ReadonlySet<AttendanceStatus> = new Set([
    "ABSENT",
    "OFF",
    "LEAVE",
  ]);

  const [pendingImpact, setPendingImpact] = useState<{
    employeeId: number;
    employeeName: string;
    newStatus: AttendanceStatus;
    bookings: AttendanceImpactBooking[];
  } | null>(null);
  const [impactApplying, setImpactApplying] = useState(false);

  const applyStatusChange = async (
    employeeId: number,
    newStatus: AttendanceStatus,
  ) => {
    addOptimisticUpdate({ employeeId, status: newStatus });
    const result = await updateAttendanceStatus(
      employeeId,
      currentDate,
      newStatus,
    );
    if (!result.success) {
      toast.error("Failed to update status");
      router.refresh();
    }
  };

  const handleStatusChange = async (
    employeeId: number,
    newStatus: AttendanceStatus,
  ) => {
    // Non-blocking transitions (PRESENT, LATE) skip the preview â€” there
    // are no bookings to orphan.
    if (!BLOCKING_STATUSES.has(newStatus)) {
      await applyStatusChange(employeeId, newStatus);
      return;
    }

    // Run the preview before mutating. If zero bookings would be
    // affected, apply silently â€” no point in a confirmation dialog
    // that says "0 bookings will be affected".
    const preview = await previewAttendanceImpactAction(employeeId, currentDate);
    if (!preview.success) {
      // Fall through to normal apply path â€” failing the preview should
      // not block the manager from doing their job.
      await applyStatusChange(employeeId, newStatus);
      return;
    }
    if (preview.bookings.length === 0) {
      await applyStatusChange(employeeId, newStatus);
      return;
    }

    const employee = optimisticData.find((d) => d.employee.id === employeeId);
    setPendingImpact({
      employeeId,
      employeeName: employee?.employee.user.name ?? `Employee #${employeeId}`,
      newStatus,
      bookings: preview.bookings,
    });
  };

  const confirmPendingImpact = async () => {
    if (!pendingImpact) return;
    setImpactApplying(true);
    try {
      await applyStatusChange(pendingImpact.employeeId, pendingImpact.newStatus);
    } finally {
      setImpactApplying(false);
      setPendingImpact(null);
    }
  };

  // Summary logic
  const summary = {
    PRESENT: optimisticData.filter((d) => d.attendance?.status === "PRESENT")
      .length,
    LATE: optimisticData.filter((d) => d.attendance?.status === "LATE").length,
    ABSENT: optimisticData.filter((d) => d.attendance?.status === "ABSENT")
      .length,
    LEAVE: optimisticData.filter((d) => d.attendance?.status === "LEAVE")
      .length,
    OFF: optimisticData.filter((d) => d.attendance?.status === "OFF").length,
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-blue-500",
      "bg-emerald-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-cyan-500",
      "bg-indigo-500",
      "bg-teal-500",
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="space-y-6" data-business-id={businessId}>
      <EmployeeAttendanceHistoryDialog
        employee={selectedEmployee}
        open={!!selectedEmployee}
        onOpenChange={(open) => !open && setSelectedEmployee(null)}
      />

      <AttendanceImpactDialog
        open={!!pendingImpact}
        onOpenChange={(open) => !open && !impactApplying && setPendingImpact(null)}
        employeeName={pendingImpact?.employeeName ?? ""}
        newStatusLabel={statusVerb(pendingImpact?.newStatus)}
        bookings={pendingImpact?.bookings ?? []}
        loading={impactApplying}
        onConfirm={confirmPendingImpact}
      />

      {/* Date Navigator */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-1.5 rounded-2xl border border-border">
        <div className="flex items-center gap-1 p-1 bg-muted/80 rounded-xl border border-border/50">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDateChange(subDays(currentDate, 1))}
            disabled={isPending}
            className="h-8 w-8 rounded-lg hover:bg-background hover:shadow-sm text-muted-foreground transition-all cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "h-8 px-3 text-sm font-medium text-foreground hover:bg-background hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-border/50 cursor-pointer",
                  !currentDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                {currentDate ? (
                  format(currentDate, "MMMM do, yyyy")
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => date && handleDateChange(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDateChange(addDays(currentDate, 1))}
            disabled={isPending}
            className="h-8 w-8 rounded-lg hover:bg-background hover:shadow-sm text-muted-foreground transition-all cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 pr-2">
          {!isSameDay(currentDate, new Date()) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDateChange(new Date())}
              disabled={isPending}
              className="h-8 text-xs font-medium rounded-lg border-border hover:bg-accent/30 cursor-pointer"
            >
              Go to Today
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={refreshData}
            disabled={isPending}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <SummaryCard title="Present" count={summary.PRESENT} indicatorColor="bg-emerald-500" />
        <SummaryCard title="Late" count={summary.LATE} indicatorColor="bg-amber-500" />
        <SummaryCard title="Absent" count={summary.ABSENT} indicatorColor="bg-rose-500" />
        <SummaryCard title="On Leave" count={summary.LEAVE} indicatorColor="bg-blue-500" />
        <SummaryCard title="Off" count={summary.OFF} indicatorColor="bg-muted-foreground" />
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden grid grid-cols-1 gap-3">
        {optimisticData.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <User className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground">No employees found</h3>
            <p className="text-muted-foreground">Try selecting a different date or refreshing.</p>
          </div>
        ) : (
          optimisticData.map(({ employee, attendance }) => (
            <div
              key={employee.id}
              className="bg-card rounded-2xl p-4 border border-border flex flex-col gap-4 transition-all active:scale-[0.99]"
            >
              <div className="flex justify-between items-start">
                <div
                  className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setSelectedEmployee(employee)}
                >
                  <Avatar className={`${getAvatarColor(employee.user.name)} h-10 w-10 text-white shadow-sm`}>
                    <AvatarFallback className="bg-transparent font-medium">
                      {getInitials(employee.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {employee.user.name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pl-[52px] -mt-2 mb-2" onClick={(e) => e.stopPropagation()}>
                <Select
                  defaultValue={attendance?.status || "ABSENT"}
                  value={attendance?.status || "ABSENT"}
                  onValueChange={(val) => handleStatusChange(employee.id, val as AttendanceStatus)}
                >
                  <SelectTrigger className="h-7 w-[110px] text-xs rounded-lg border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="PRESENT">Present</SelectItem>
                    <SelectItem value="LATE">Late</SelectItem>
                    <SelectItem value="ABSENT">Absent</SelectItem>
                    <SelectItem value="LEAVE">On Leave</SelectItem>
                    <SelectItem value="OFF">Day Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3 py-3 border-t border-border/50">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time In
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {attendance?.time_in ? format(new Date(attendance.time_in), "hh:mm a") : "-"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time Out
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {attendance?.time_out ? format(new Date(attendance.time_out), "hh:mm a") : "-"}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block rounded-2xl border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border bg-muted/50">
              <TableHead className="pl-6 h-11 font-semibold text-muted-foreground">Employee</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Time In</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground">Time Out</TableHead>
              <TableHead className="h-11 font-semibold text-muted-foreground w-[200px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {optimisticData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              optimisticData.map(({ employee, attendance }) => (
                <TableRow
                  key={employee.id}
                  className="hover:bg-accent/30 transition-colors border-border/50 group"
                >
                  <TableCell
                    className="pl-6 py-4 cursor-pointer"
                    onClick={() => setSelectedEmployee(employee)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className={`${getAvatarColor(employee.user.name)} h-9 w-9 text-white shadow-sm`}>
                        <AvatarFallback className="bg-transparent font-medium">
                          {getInitials(employee.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {employee.user.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-muted-foreground">
                    {attendance?.time_in ? (
                      <span className="bg-muted text-foreground px-2 py-1 rounded-md text-xs font-medium font-mono">
                        {format(new Date(attendance.time_in), "hh:mm a")}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="py-4 text-muted-foreground">
                    {attendance?.time_out ? (
                      <span className="bg-muted text-foreground px-2 py-1 rounded-md text-xs font-medium font-mono">
                        {format(new Date(attendance.time_out), "hh:mm a")}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <Select
                      defaultValue={attendance?.status || "ABSENT"}
                      value={attendance?.status || "ABSENT"}
                      onValueChange={(val) => handleStatusChange(employee.id, val as AttendanceStatus)}
                    >
                      <SelectTrigger className="w-[140px] rounded-xl border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="PRESENT">Present</SelectItem>
                        <SelectItem value="LATE">Late</SelectItem>
                        <SelectItem value="ABSENT">Absent</SelectItem>
                        <SelectItem value="LEAVE">On Leave</SelectItem>
                        <SelectItem value="OFF">Day Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  count,
  indicatorColor,
}: {
  title: string;
  count: number;
  indicatorColor: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 hover:border-primary/20 transition-colors duration-200">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${indicatorColor}`} />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
      </div>
      <span className="text-3xl font-bold text-foreground pl-3.5">{count}</span>
    </div>
  );
}
