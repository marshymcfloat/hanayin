import { prisma } from "@/prisma/prisma";

export async function getTenantEmployeeAttendanceCount(input: {
  employeeId: number;
  businessId: string;
  startDate: Date;
  endDate: Date;
}) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, business_id: input.businessId },
    select: { id: true },
  });
  if (!employee) return { success: false as const, error: "Unauthorized" };
  const count = await prisma.employeeAttendance.count({
    where: {
      employee_id: input.employeeId,
      employee: { business_id: input.businessId },
      status: "PRESENT",
      date: { gt: input.startDate, lte: input.endDate },
    },
  });
  return { success: true as const, data: count };
}
