import { requireAuth } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { publicUserSelect } from "@/lib/auth/public-user";
import { currentWorkforceOwner } from "@/features/workforce/workforce-access";

export async function getLeaveRequests(businessId: string) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }
  if (!await currentWorkforceOwner(auth.businessSlug, auth.session.user.id)) return { success: false as const, error: "Forbidden" };

  try {
    const business = await prisma.business.findFirst({
      where: { id: businessId, slug: auth.businessSlug },
      select: { id: true },
    });
    if (!business) {
      return { success: false as const, error: "Unauthorized" };
    }
    const requests = await prisma.leaveRequest.findMany({
      where: { business_id: business.id, cancelled_at: null },
      include: { employee: { include: { user: { select: publicUserSelect } } } },
      orderBy: { created_at: "desc" },
    });
    return { success: true as const, data: requests };
  } catch (error) {
    console.error("Failed to fetch leave requests:", error);
    return { success: false as const, error: "Failed to fetch leave requests" };
  }
}

export async function getUserLeaveRequests(employeeId: number) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  if (auth.session.user.role === Role.OWNER && !await currentWorkforceOwner(auth.businessSlug, auth.session.user.id)) return { success: false as const, error: "Forbidden" };

  try {
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        archived_at: null,
        business: { slug: auth.businessSlug },
        ...(auth.session.user.role === Role.EMPLOYEE
          ? { user_id: auth.session.user.id }
          : {}),
      },
      select: { id: true, business_id: true },
    });
    if (!employee || auth.session.user.role === Role.PLATFORM_ADMIN) {
      return { success: false as const, error: "Unauthorized" };
    }
    const requests = await prisma.leaveRequest.findMany({
      where: {
        employee_id: employee.id,
        business_id: employee.business_id,
        cancelled_at: null,
      },
      orderBy: { created_at: "desc" },
    });
    if (auth.session.user.role === Role.OWNER && !await currentWorkforceOwner(auth.businessSlug, auth.session.user.id)) return { success: false as const, error: "Forbidden" };
    return { success: true as const, data: requests };
  } catch (error) {
    console.error("Failed to fetch user leave requests:", error);
    return {
      success: false as const,
      error: "Failed to fetch user leave requests",
    };
  }
}
