"use server";

import {
  claimEmployeeService,
  markEmployeeServiceServed,
  unclaimEmployeeService,
  unserveEmployeeService,
} from "@/features/dashboard/services/employee-queue";
import {
  getEmployeeServiceWork,
  getEmployeeTodayBookings,
  getManagerQueueBoard,
} from "@/features/dashboard/queries/employee-actions";
import { getEmployeeDashboardMembership } from "@/features/dashboard/queries/employee-membership";
import {
  claimServiceSchema,
  markServedSchema,
  serviceIdSchema,
} from "@/features/dashboard/schemas";
import { requireAuth } from "@/lib/auth/guards";
import {
  hasStaffPermission,
  resolveTenantActorContext,
  type TenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { revalidatePath } from "next/cache";

type StaffContext = Extract<TenantActorContext, { success: true }>;

type StaffContextResult =
  | { success: true; businessSlug: string; context: StaffContext }
  | { success: false; error: string };

async function requireStaffContext(options?: {
  write?: boolean;
}): Promise<StaffContextResult> {
  const auth = await requireAuth(options);
  if (!auth.success) return { success: false, error: auth.error };

  const context = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );
  if (!context.success) return { success: false, error: context.error };

  return { success: true, businessSlug: auth.businessSlug, context };
}

export async function claimServiceAction(
  serviceId: number,
  employeeId: number,
) {
  const validation = claimServiceSchema.safeParse({ serviceId, employeeId });
  if (!validation.success) return { success: false, error: "Invalid input" };

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;

  const result = await claimEmployeeService({
    businessSlug: auth.businessSlug,
    context: auth.context,
    serviceId,
    employeeId,
  });
  if (result.success) revalidatePath(`/app/${auth.businessSlug}`);
  return result;
}

export async function unclaimServiceAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) return { success: false, error: "Invalid input" };

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;

  const result = await unclaimEmployeeService({
    businessSlug: auth.businessSlug,
    context: auth.context,
    serviceId,
  });
  if (result.success) revalidatePath(`/app/${auth.businessSlug}`);
  return result;
}

export async function markServiceServedAction(
  serviceId: number,
  employeeId: number,
) {
  const validation = markServedSchema.safeParse({ serviceId, employeeId });
  if (!validation.success) return { success: false, error: "Invalid input" };

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;

  const result = await markEmployeeServiceServed({
    businessSlug: auth.businessSlug,
    context: auth.context,
    serviceId,
    employeeId,
  });
  if (result.success) revalidatePath(`/app/${auth.businessSlug}`);
  return result;
}

export async function unserveServiceAction(serviceId: number) {
  const validation = serviceIdSchema.safeParse({ serviceId });
  if (!validation.success) return { success: false, error: "Invalid input" };

  const auth = await requireStaffContext({ write: true });
  if (!auth.success) return auth;

  const result = await unserveEmployeeService({
    businessSlug: auth.businessSlug,
    context: auth.context,
    serviceId,
  });
  if (result.success) revalidatePath(`/app/${auth.businessSlug}`);
  return result;
}

export async function getManagerQueueBoardAction() {
  const auth = await requireStaffContext();
  if (!auth.success) return auth;
  if (!hasStaffPermission(auth.context, StaffPermission.QUEUE_OVERRIDE_ALL)) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const data = await getManagerQueueBoard(auth.businessSlug);
    return { success: true as const, data };
  } catch (error) {
    console.error("Error fetching manager queue board:", error);
    return {
      success: false as const,
      error: "Failed to fetch manager queue board.",
    };
  }
}

type EmployeeAuthResult =
  | {
      success: true;
      businessSlug: string;
      employeeId: number;
      specialties: string[];
      context: StaffContext;
    }
  | { success: false; error: string };

async function requireEmployeeAuth(options?: {
  write?: boolean;
  permission?: StaffPermission;
}): Promise<EmployeeAuthResult> {
  const auth = await requireStaffContext({ write: options?.write });
  if (!auth.success) return auth;

  const { businessSlug, context } = auth;
  if (context.actorType !== "EMPLOYEE") {
    return { success: false, error: "Unauthorized" };
  }
  if (options?.permission && !hasStaffPermission(context, options.permission)) {
    return { success: false, error: "Forbidden" };
  }

  try {
    const employee = await getEmployeeDashboardMembership(context);
    if (!employee) return { success: false, error: "Unauthorized" };

    return {
      success: true,
      businessSlug,
      employeeId: employee.id,
      specialties: employee.specialties ?? [],
      context,
    };
  } catch {
    return { success: false, error: "Unable to verify employee access." };
  }
}

export async function getEmployeeTodayBookingsAction() {
  const auth = await requireEmployeeAuth({
    permission: StaffPermission.PAYMENT_COLLECT,
  });
  if (!auth.success) return [];

  try {
    return await getEmployeeTodayBookings({
      businessSlug: auth.businessSlug,
      specialties: auth.specialties,
    });
  } catch (error) {
    console.error("Error fetching employee today bookings:", error);
    return [];
  }
}

export async function getEmployeeServiceWorkAction() {
  const auth = await requireEmployeeAuth();
  if (!auth.success) return auth;

  try {
    const data = await getEmployeeServiceWork({
      businessSlug: auth.businessSlug,
      employeeId: auth.employeeId,
    });
    return { success: true as const, data };
  } catch (error) {
    console.error("Error fetching employee service work:", error);
    return {
      success: false as const,
      error: "Unable to refresh service work.",
    };
  }
}
