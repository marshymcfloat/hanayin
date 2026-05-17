"use server";

import { hash } from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { requireAuth } from "@/lib/auth/guards";
import { sanitizeStaffPermissions } from "@/lib/auth/staff-access";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { sendEmployeeInviteSms } from "@/lib/services/employee-invite";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";
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
            contact_number: true,
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
// Sanitizes incoming day-of-week ints. Anything outside 0–6 is dropped;
// duplicates are collapsed. Keeps the DB array small and predictable.
function sanitizeRecurringDaysOff(input?: number[]): number[] {
  if (!Array.isArray(input)) return [];
  const cleaned = new Set<number>();
  for (const day of input) {
    if (Number.isInteger(day) && day >= 0 && day <= 6) cleaned.add(day);
  }
  return Array.from(cleaned).sort((a, b) => a - b);
}

export async function createEmployeeAction(data: {
  name: string;
  contact_number: string;
  daily_rate: number;
  commission_percentage: number;
  profile?: StaffProfile;
  permissions?: StaffPermission[];
  specialties?: string[];
  recurring_days_off?: number[];
}) {
  const auth = await requireOwnerWriteAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  const profile = data.profile ?? StaffProfile.STAFF;
  const permissions = sanitizeStaffPermissions(profile, data.permissions);
  const normalizedContact = normalizePhilippinePhone(data.contact_number);

  if (!/^63\d{10}$/.test(normalizedContact)) {
    return {
      success: false,
      error: "Enter a valid Philippine mobile number (e.g., 09XX XXX XXXX).",
    };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { contact_number: normalizedContact },
      select: { id: true },
    });

    if (existingUser) {
      return { success: false, error: "Contact number already in use" };
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
            contact_number: normalizedContact,
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
            specialties: (data.specialties ?? []).map((s) => s.toLowerCase()),
            recurring_days_off: sanitizeRecurringDaysOff(data.recurring_days_off),
          },
          include: {
            user: true,
          },
        });

        return employee;
      },
    );

    const smsResult = await sendEmployeeInviteSms({
      to: normalizedContact,
      employeeName: data.name,
      businessName: business.name,
      tempPassword,
      expiresAt: tempPasswordExpiresAt,
    });

    revalidatePath(`/app/${businessSlug}/employees`);

    if (!smsResult.success) {
      console.error("Failed to send employee invite SMS:", smsResult.error);
      return {
        success: true,
        data: result,
        warning: "Employee created but SMS failed to send.",
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
    contact_number?: string;
    daily_rate?: number;
    commission_percentage?: number;
    profile?: StaffProfile;
    permissions?: StaffPermission[];
    specialties?: string[];
    recurring_days_off?: number[];
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

    let normalizedContact: string | undefined;
    if (data.contact_number) {
      normalizedContact = normalizePhilippinePhone(data.contact_number);

      if (!/^63\d{10}$/.test(normalizedContact)) {
        return {
          success: false,
          error: "Enter a valid Philippine mobile number (e.g., 09XX XXX XXXX).",
        };
      }

      if (normalizedContact !== employee.user.contact_number) {
        const existingUser = await prisma.user.findUnique({
          where: { contact_number: normalizedContact },
          select: { id: true },
        });
        if (existingUser && existingUser.id !== employee.user_id) {
          return { success: false, error: "Contact number already in use" };
        }
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
      if (data.name || normalizedContact) {
        await tx.user.update({
          where: { id: employee.user_id },
          data: {
            ...(data.name && { name: data.name }),
            ...(normalizedContact && { contact_number: normalizedContact }),
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
            specialties: data.specialties.map((s) => s.toLowerCase()),
          }),
          ...(data.recurring_days_off !== undefined && {
            recurring_days_off: sanitizeRecurringDaysOff(data.recurring_days_off),
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

// ---- Employee weekly schedule ---------------------------------------

export type EmployeeScheduleRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Filters/normalizes incoming schedule rows. Anything we can't parse is
// dropped so a bad submission can never make the DB go inconsistent.
// Overlapping ranges on the same day are rejected -- not silently merged
// -- so the user gets a clear error instead of mysteriously losing data.
function validateScheduleRows(
  rows: EmployeeScheduleRow[],
): { ok: true; rows: EmployeeScheduleRow[] } | { ok: false; error: string } {
  const cleaned: EmployeeScheduleRow[] = [];
  for (const raw of rows) {
    if (
      !Number.isInteger(raw.day_of_week) ||
      raw.day_of_week < 0 ||
      raw.day_of_week > 6
    ) {
      return { ok: false, error: "Invalid day of week." };
    }
    if (!TIME_RE.test(raw.start_time) || !TIME_RE.test(raw.end_time)) {
      return { ok: false, error: "Times must be in HH:MM 24h format." };
    }
    if (raw.start_time === raw.end_time) {
      return { ok: false, error: "Start and end can't be the same time." };
    }
    cleaned.push({
      day_of_week: raw.day_of_week,
      start_time: raw.start_time,
      end_time: raw.end_time,
    });
  }
  // Check overlap per day (overnight shifts excluded from this check —
  // they're rare and the booking engine handles them correctly).
  const byDay = new Map<number, EmployeeScheduleRow[]>();
  for (const row of cleaned) {
    const list = byDay.get(row.day_of_week) ?? [];
    list.push(row);
    byDay.set(row.day_of_week, list);
  }
  for (const [, list] of byDay) {
    const sorted = [...list]
      .filter((r) => r.start_time < r.end_time)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start_time < sorted[i - 1].end_time) {
        return {
          ok: false,
          error: "Time ranges overlap on the same day.",
        };
      }
    }
  }
  return { ok: true, rows: cleaned };
}

export async function getEmployeeScheduleAction(employeeId: number) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  const businessId = await resolveTenantBusinessId(businessSlug);
  if (!businessId) return { success: false, error: "Business not found" };

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, business_id: businessId },
    select: { id: true },
  });
  if (!employee) return { success: false, error: "Employee not found" };

  const rows = await prisma.employeeSchedule.findMany({
    where: { employee_id: employeeId },
    orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
    select: {
      day_of_week: true,
      start_time: true,
      end_time: true,
    },
  });
  return { success: true, data: rows };
}

export async function upsertEmployeeScheduleAction(
  employeeId: number,
  rows: EmployeeScheduleRow[],
) {
  const auth = await requireOwnerWriteAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  const businessId = await resolveTenantBusinessId(businessSlug);
  if (!businessId) return { success: false, error: "Business not found" };

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, business_id: businessId },
    select: { id: true },
  });
  if (!employee) return { success: false, error: "Employee not found" };

  const validated = validateScheduleRows(rows);
  if (!validated.ok) return { success: false, error: validated.error };

  try {
    // Transactional replace-all keeps the schedule atomic — partial
    // saves on validation failure would leave operators guessing what
    // actually persisted.
    await prisma.$transaction(async (tx) => {
      await tx.employeeSchedule.deleteMany({
        where: { employee_id: employeeId },
      });
      if (validated.rows.length > 0) {
        await tx.employeeSchedule.createMany({
          data: validated.rows.map((row) => ({
            employee_id: employeeId,
            day_of_week: row.day_of_week,
            start_time: row.start_time,
            end_time: row.end_time,
          })),
        });
      }
    });

    revalidatePath(`/app/${businessSlug}/employees`);
    return { success: true };
  } catch (error) {
    logger.error("Failed to upsert employee schedule:", { error });
    return { success: false, error: "Failed to save schedule." };
  }
}
