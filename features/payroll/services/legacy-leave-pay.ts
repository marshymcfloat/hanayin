import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { phDay, day } from "@/features/payroll/v2/period";

export async function unpaidLegacyLeave(employeeId: number, businessSlug: string, until: Date, db: Prisma.TransactionClient = prisma) {
  const allocations = await db.leaveAllocation.findMany({
    where: { employee_id: employeeId, employee: { business: { slug: businessSlug } }, paid: true, cancelled_at: null, paid_in_payslip_id: null, work_date: { lte: day(phDay(until)) } },
    orderBy: { work_date: "asc" },
  });
  return { allocations, attendance: allocations.map((entry, index) => ({ id: -index - 1, date: new Date(entry.work_date.toISOString().slice(0, 10) + "T00:00:00+08:00"), status: "LEAVE", is_paid_leave: true })) };
}
