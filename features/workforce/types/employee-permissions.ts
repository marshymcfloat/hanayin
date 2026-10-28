import type { StaffPermission } from "@/prisma/generated/prisma/enums";

export type EmployeePermissionsResult =
  | { success: true; employeeId: number; permissions: StaffPermission[] }
  | {
      success: false;
      error: string;
      code?: "Forbidden" | "Unauthorized" | "InvalidInput" | "NOT_FOUND";
    };
