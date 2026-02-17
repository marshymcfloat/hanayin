"use server";

import { hash } from "bcryptjs";
import crypto from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { requireAuth } from "@/lib/auth/guards";
import { sanitizeStaffPermissions } from "@/lib/auth/staff-access";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { sendEmployeeInviteEmail } from "@/lib/services/employee-invite";
import { prisma } from "@/prisma/prisma";
import { Prisma, Role } from "@/prisma/generated/prisma/client";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

async function resolveTenantBusinessId(businessSlug: string) {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });
  return business?.id ?? null;
}

async function requireOwnerWriteAccess() {
  const auth = await requireAuth({ write: true });
  if (!auth.success) {
    return auth;
  }

  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }

  return auth;
}

// Get all employees for a business
export async function getEmployeesAction() {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const employees = await prisma.employee.findMany({
      where: {
        business: {
          slug: businessSlug,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            created_at: true,
            updated_at: true,
          },
        },
        attendance: {
          orderBy: { date: "desc" },
          take: 7,
        },
        payslips: {
          orderBy: { ending_date: "desc" },
          take: 1,
        },
        _count: {
          select: {
            served_services: true,
          },
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    });

    return { success: true, data: employees };
  } catch (error) {
    console.error("Failed to get employees:", error);
    return { success: false, error: "Failed to fetch employees" };
  }
}

// Create a new employee (also creates a user account)
export async function createEmployeeAction(data: {
  name: string;
  email: string;
  daily_rate: number;
  commission_percentage: number;
  profile?: StaffProfile;
  permissions?: StaffPermission[];
  specialties?: string[];
}) {
  const auth = await requireOwnerWriteAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  const profile = data.profile ?? StaffProfile.STAFF;
  const permissions = sanitizeStaffPermissions(profile, data.permissions);

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });

    if (existingUser) {
      return { success: false, error: "Email already in use" };
    }

    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true, name: true },
    });

    if (!business) {
      return { success: false, error: "Business not found" };
    }

    const tempPassword = crypto
      .randomBytes(12)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 12);
    const hashedPassword = await hash(tempPassword, 12);
    const tempPasswordExpiresAt = new Date(
      getCurrentDateTimePH().getTime() + 24 * 60 * 60 * 1000,
    );

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            name: data.name,
            email: data.email,
            hashed_password: hashedPassword,
            role: Role.EMPLOYEE,
            must_change_password: true,
            temp_password_expires_at: tempPasswordExpiresAt,
          },
        });

        const employee = await tx.employee.create({
          data: {
            user_id: user.id,
            business_id: business.id,
            salary: 0, // Legacy field
            daily_rate: data.daily_rate,
            commission_percentage: data.commission_percentage,
            profile,
            permissions,
            specialties: data.specialties ?? [],
          },
          include: {
            user: true,
          },
        });

        return employee;
      },
    );

    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = headersList.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;
    const changePasswordUrl = `${baseUrl}/app/${businessSlug}/change-password`;

    const emailResult = await sendEmployeeInviteEmail({
      to: data.email,
      employeeName: data.name,
      businessName: business.name,
      tempPassword,
      expiresAt: tempPasswordExpiresAt,
      changePasswordUrl,
    });

    revalidatePath(`/app/${businessSlug}/employees`);

    if (!emailResult.success) {
      console.error("Failed to send employee invite email:", emailResult.error);
      return {
        success: true,
        data: result,
        warning: "Employee created but email failed to send.",
      };
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("Failed to create employee:", error);
    return { success: false, error: "Failed to create employee" };
  }
}

// Update an employee
export async function updateEmployeeAction(
  employeeId: number,
  data: {
    name?: string;
    email?: string;
    daily_rate?: number;
    commission_percentage?: number;
    profile?: StaffProfile;
    permissions?: StaffPermission[];
    specialties?: string[];
  },
) {
  const auth = await requireOwnerWriteAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const businessId = await resolveTenantBusinessId(businessSlug);
    if (!businessId) {
      return { success: false, error: "Business not found" };
    }

    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        business_id: businessId,
      },
      include: { user: true },
    });

    if (!employee) {
      return { success: false, error: "Employee not found" };
    }

    if (data.email && data.email !== employee.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existingUser && existingUser.id !== employee.user_id) {
        return { success: false, error: "Email already in use" };
      }
    }

    const nextProfile = data.profile ?? employee.profile ?? StaffProfile.STAFF;
    const nextPermissions =
      data.permissions !== undefined
        ? sanitizeStaffPermissions(nextProfile, data.permissions)
        : data.profile !== undefined
          ? sanitizeStaffPermissions(nextProfile, undefined)
          : undefined;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (data.name || data.email) {
        await tx.user.update({
          where: { id: employee.user_id },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.email && { email: data.email }),
          },
        });
      }

      await tx.employee.update({
        where: { id: employeeId },
        data: {
          ...(data.daily_rate !== undefined && { daily_rate: data.daily_rate }),
          ...(data.commission_percentage !== undefined && {
            commission_percentage: data.commission_percentage,
          }),
          ...(data.specialties !== undefined && {
            specialties: data.specialties,
          }),
          ...(data.profile !== undefined && { profile: nextProfile }),
          ...(nextPermissions !== undefined && { permissions: nextPermissions }),
        },
      });
    });

    if (data.specialties !== undefined) {
      try {
        await detectAndEmitFutureBookingConflicts({
          businessSlug,
          trigger: "EMPLOYEE_SPECIALTIES_UPDATED",
        });
      } catch (error) {
        logger.warn("[BookingConflicts] Failed after employee specialty update", {
          employeeId,
          businessSlug,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    revalidatePath(`/app/${businessSlug}/employees`);
    return { success: true };
  } catch (error) {
    console.error("Failed to update employee:", error);
    return { success: false, error: "Failed to update employee" };
  }
}

// Delete an employee
export async function deleteEmployeeAction(employeeId: number) {
  const auth = await requireOwnerWriteAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const businessId = await resolveTenantBusinessId(businessSlug);
    if (!businessId) {
      return { success: false, error: "Business not found" };
    }

    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        business_id: businessId,
      },
      select: { id: true },
    });

    if (!employee) {
      return { success: false, error: "Employee not found" };
    }

    await prisma.employee.delete({
      where: { id: employee.id },
    });

    revalidatePath(`/app/${businessSlug}/employees`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete employee:", error);
    return { success: false, error: "Failed to delete employee" };
  }
}

// Reset employee password
export async function resetEmployeePasswordAction(
  employeeId: number,
  newPassword: string,
) {
  const auth = await requireOwnerWriteAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const businessId = await resolveTenantBusinessId(businessSlug);
    if (!businessId) {
      return { success: false, error: "Business not found" };
    }

    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        business_id: businessId,
      },
      select: { user_id: true },
    });

    if (!employee) {
      return { success: false, error: "Employee not found" };
    }

    const hashedPassword = await hash(newPassword, 12);

    await prisma.user.update({
      where: { id: employee.user_id },
      data: { hashed_password: hashedPassword },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to reset password:", error);
    return { success: false, error: "Failed to reset password" };
  }
}
