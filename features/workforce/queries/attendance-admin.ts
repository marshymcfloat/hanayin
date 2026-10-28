import { unstable_cache } from "next/cache";

import { getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { prisma } from "@/prisma/prisma";

export async function getDailyAttendanceForTenant(
  businessSlug: string,
  businessId: string,
  date: Date,
) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, slug: businessSlug },
    select: { id: true },
  });
  if (!business) return null;

  const employees = await prisma.employee.findMany({
    where: { business_id: business.id },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  const attendanceRecords = await prisma.employeeAttendance.findMany({
    where: {
      employee: { business_id: business.id },
      date: {
        gte: getStartOfDayPH(date),
        lte: getEndOfDayPH(date),
      },
    },
  });

  return employees.map((employee) => ({
    employee,
    attendance:
      attendanceRecords.find((record) => record.employee_id === employee.id) ??
      null,
  }));
}

export async function getEmployeeAttendanceHistoryForTenant(
  businessSlug: string,
  employeeId: number,
) {
  const getCachedHistory = unstable_cache(
    async (slug: string, id: number) =>
      prisma.employeeAttendance.findMany({
        where: {
          employee_id: id,
          employee: { business: { slug } },
        },
        orderBy: { date: "desc" },
        take: 90,
      }),
    ["attendance-history"],
    {
      revalidate: 60 * 60,
      tags: [`attendance-${employeeId}`, `attendance-history-${businessSlug}`],
    },
  );

  return getCachedHistory(businessSlug, employeeId);
}
