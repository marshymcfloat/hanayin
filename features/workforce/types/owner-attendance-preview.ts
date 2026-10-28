export type OwnerAttendancePreviewData = {
  businessName: string;
  date: string;
  employees: Array<{
    id: number;
    name: string;
    role: string;
    status: "PRESENT" | "LATE" | "ABSENT" | "OFF" | "LEAVE" | "UNRECORDED";
    timeIn: string | null;
    timeOut: string | null;
  }>;
  pendingLeaveCount: number;
  leaveRequests: Array<{
    id: number;
    employeeName: string;
    startDate: string;
    endDate: string;
    reason: string;
    submittedAt: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
  }>;
};

export type AttendanceConfirmedChange =
  | { type: "status"; employeeId: number; date: string; status: Exclude<OwnerAttendancePreviewData["employees"][number]["status"], "UNRECORDED"> }
  | { type: "leave"; requestId: number; status: "APPROVED" | "REJECTED" };
