// Colocated feature action module.
import { prisma } from "@/prisma/prisma";

export async function getAttendanceCountAction(
  employeeId: number,
  startDate: Date,
  endDate: Date,
) {
  try {
    const count = await prisma.employeeAttendance.count({
      where: {
        employee_id: employeeId,
        status: "PRESENT",
        date: {
          gt: startDate,
          lte: endDate,
        },
      },
    });
    return { success: true, data: count };
  } catch (error) {
    console.error("Error fetching attendance count:", error);
    return { success: false, error: "Failed to fetch attendance count" };
  }
}
