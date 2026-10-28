"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays } from "lucide-react";
import { DailyAttendanceTab } from "./DailyAttendanceTab";
import { LeaveRequestsTab } from "./LeaveRequestsTab";
import { Prisma } from "@/prisma/generated/prisma/client";
import { publicUserSelect } from "@/lib/auth/public-user";

type LeaveRequestWithEmployee = Prisma.LeaveRequestGetPayload<{
  include: {
    employee: {
      include: {
        user: { select: typeof publicUserSelect };
      };
    };
  };
}>;

import { Employee, EmployeeAttendance } from "@/prisma/generated/prisma/client";

type AttendanceData = {
  employee: Employee & { user: { name: string } };
  attendance: EmployeeAttendance | null;
};

interface OwnerAttendanceClientProps {
  businessId: string;
  businessSlug: string;
  leaveRequests: LeaveRequestWithEmployee[];
  initialDailyAttendance: AttendanceData[];
  currentDate: Date;
}

export function OwnerAttendanceClient({
  businessId,
  businessSlug,
  leaveRequests,
  initialDailyAttendance,
  currentDate,
}: OwnerAttendanceClientProps) {
  return (
    <div className="flex flex-col bg-background">
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-8 py-5 sm:py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <CalendarDays className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Attendance</h1>
              <p className="text-xs text-muted-foreground">Monitor daily attendance and manage leave requests.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          <Tabs defaultValue="daily" className="space-y-4">
            <TabsList className="bg-muted rounded-xl p-1 h-auto">
              <TabsTrigger
                value="daily"
                className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground cursor-pointer"
              >
                Daily Attendance
              </TabsTrigger>
              <TabsTrigger
                value="requests"
                className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground cursor-pointer"
              >
                Leave Requests
                {leaveRequests.some((r) => r.status === "PENDING") && (
                  <span className="ml-2 h-2 w-2 rounded-full bg-destructive" />
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="daily" className="space-y-4">
              <DailyAttendanceTab
                businessId={businessId}
                initialData={initialDailyAttendance}
                currentDate={currentDate}
              />
            </TabsContent>
            <TabsContent value="requests" className="space-y-4">
              <LeaveRequestsTab
                requests={leaveRequests}
                params={{ businessSlug }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
