import "server-only";
import crypto from "crypto";
import { hash } from "bcryptjs";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { StaffProfile } from "@/prisma/generated/prisma/enums";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { sanitizeStaffPermissions } from "@/lib/auth/staff-access";
import { TEMP_PASSWORD_TTL_MS } from "@/lib/auth/temporary-password";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";
import { sendEmployeeInviteSms } from "@/lib/services/employee-invite";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/services/audit";
import { employeeAdministrationTargetWhere, resolveEmployeeAdministrationAccess, type EmployeeAdministrationActor } from "@/features/workforce/employee-administration-access";
import type { EmployeeAdministrationIdentity, EmployeeCreateInput, EmployeeScheduleRow, EmployeeUpdateInput } from "@/features/workforce/employee-administration-types";
import { employmentDateChangeError } from "@/features/workforce/services/employment-date";

const transactionOptions = { isolationLevel: "Serializable" as const, maxWait: 5_000, timeout: 10_000 };
const tempAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
class EmployeeAdministrationError extends Error {}
const targetSelect = { id: true, business_id: true, user_id: true, profile: true, permissions: true, specialties: true, recurring_days_off: true, daily_rate: true, commission_percentage: true, employment_start: true, employment_end: true, financial_revision: true, user: { select: { ...publicUserSelect, hashed_password: true, must_change_password: true, temp_password_expires_at: true } }, business: { select: { name: true } } } as const satisfies Prisma.EmployeeSelect;
type Target = Prisma.EmployeeGetPayload<{ select: typeof targetSelect }>;
type Access = NonNullable<Awaited<ReturnType<typeof resolveEmployeeAdministrationAccess>>>;
function tempPassword() { return Array.from({ length: 6 }, () => tempAlphabet[crypto.randomInt(tempAlphabet.length)]).join(""); }
function daysOff(input?: number[]) { return [...new Set((input ?? []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b); }
function warning(message: string) { try { logger.warn(message); } catch {} }
function safeFailure(error: unknown, fallback: string) {
  if (error instanceof EmployeeAdministrationError) return { success: false as const, error: error.message };
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { success: false as const, error: "Contact number already in use" };
  return { success: false as const, error: fallback };
}
async function owner(identity: EmployeeAdministrationIdentity) {
  const access = await resolveEmployeeAdministrationAccess(identity, true);
  if (!access) throw new EmployeeAdministrationError("Forbidden"); return access;
}
async function transaction<T>(identity: EmployeeAdministrationIdentity, expected: EmployeeAdministrationActor, work: (tx: Prisma.TransactionClient, access: Access) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    const access = await resolveEmployeeAdministrationAccess(identity, true, tx, expected);
    if (!access) throw new EmployeeAdministrationError("Forbidden");
    return work(tx, access);
  }, transactionOptions);
}
async function target(db: Pick<Prisma.TransactionClient, "employee">, access: Access, employeeId: number) {
  const employee = await db.employee.findFirst({ where: employeeAdministrationTargetWhere(access, employeeId), select: targetSelect });
  if (!employee) throw new EmployeeAdministrationError("Employee not found"); return employee;
}
function accountWhere(access: Access, employee: Target): Prisma.UserWhereInput {
  return { id: employee.user_id, role: "EMPLOYEE", owner: { is: null }, employee: { is: { ...employeeAdministrationTargetWhere(access, employee.id), user_id: employee.user_id } },
    name: employee.user.name, contact_number: employee.user.contact_number, hashed_password: employee.user.hashed_password, must_change_password: employee.user.must_change_password, temp_password_expires_at: employee.user.temp_password_expires_at, updated_at: employee.user.updated_at,
  };
}
function ensureChanged(count: number) { if (count !== 1) throw new EmployeeAdministrationError("Employee changed. Please try again."); }
function foreignEmployeeDeleteEdges(businessId: string): Prisma.EmployeeWhereInput[] {
  const foreign = { business_id: { not: businessId } };
  const work: Prisma.AvailedServiceWhereInput = { OR: [{ booking: foreign }, { service: foreign }, { package: { is: foreign } }, { served_by: { is: foreign } }, { served_by_owner: { is: foreign } }, { paid_in_payslip: { is: { employee: foreign } } }] };
  return [
    { served_services: { some: work } },
    { brand_assets: { some: { OR: [foreign, { service: { is: foreign } }] } } },
    { leave_requests: { some: foreign } },
    { attendance: { some: { paid_in_payslip: { is: { employee: foreign } } } } },
    { payslips: { some: { OR: [{ attendance_records: { some: { employee: foreign } } }, { availed_services: { some: work } }] } } },
  ];
}
function normalizedPhone(value: string) {
  const result = normalizePhilippinePhone(value);
  if (!/^63\d{10}$/.test(result)) throw new EmployeeAdministrationError("Enter a valid Philippine mobile number (e.g., 09XX XXX XXXX)."); return result;
}
async function deliverInvite(input: Parameters<typeof sendEmployeeInviteSms>[0]) {
  try { return (await sendEmployeeInviteSms(input)).success; }
  catch { return false; }
}

export async function createEmployeeAdministration(identity: EmployeeAdministrationIdentity, data: EmployeeCreateInput) {
  try {
    const access = await owner(identity); const contact = normalizedPhone(data.contact_number);
    if (await prisma.user.findUnique({ where: { contact_number: contact }, select: { id: true } })) throw new EmployeeAdministrationError("Contact number already in use");
    const password = tempPassword(); const hashedPassword = await hash(password, 12); const expiresAt = new Date(getCurrentDateTimePH().getTime() + TEMP_PASSWORD_TTL_MS);
    const profile = data.profile ?? StaffProfile.STAFF; const permissions = sanitizeStaffPermissions(profile, data.permissions);
    const committed = await transaction(identity, access.actor, async (tx, current) => {
      const business = await tx.business.findFirst({ where: current.business, select: { id: true, name: true } });
      if (!business) throw new EmployeeAdministrationError("Business not found");
      if (data.employment_start && !await tx.owner.findFirst({ where: { id: current.actor.ownerId!, user_id: identity.userId, business_id: current.actor.businessId, user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } })) throw new EmployeeAdministrationError("Payroll permission is required to set Joined on.");
      if ((data.daily_rate ?? 0) !== 0 || (data.commission_percentage ?? 0) !== 0) {
        if (!await tx.owner.findFirst({ where: { id: current.actor.ownerId!, user_id: identity.userId, business_id: current.actor.businessId, permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } })) throw new EmployeeAdministrationError("Payroll permission is required to set compensation.");
        const settings = await tx.payrollSettings.findUnique({ where: { business_id: current.actor.businessId }, select: { mode: true } });
        if (settings && settings.mode !== "LEGACY") throw new EmployeeAdministrationError("Create the employee with zero legacy rates, then add an effective compensation agreement in Payroll setup.");
      }
      if (await tx.user.findUnique({ where: { contact_number: contact }, select: { id: true } })) throw new EmployeeAdministrationError("Contact number already in use");
      const user = await tx.user.create({ data: { name: data.name, contact_number: contact, hashed_password: hashedPassword, role: "EMPLOYEE", must_change_password: true, temp_password_expires_at: expiresAt }, select: { id: true } });
      const employee = await tx.employee.create({ data: { user_id: user.id, business_id: current.actor.businessId, salary: 0, daily_rate: data.daily_rate, commission_percentage: data.commission_percentage, ...(data.employment_start ? { employment_start: new Date(data.employment_start + "T00:00:00Z") } : {}), profile, permissions, specialties: data.specialties ?? [], recurring_days_off: daysOff(data.recurring_days_off) }, include: { user: { select: publicUserSelect } } });
      return { employee: { ...employee, user: toPublicUser(employee.user) }, businessName: business.name };
    });
    const delivered = await deliverInvite({ to: contact, employeeName: data.name, businessName: committed.businessName, tempPassword: password, expiresAt });
    if (!delivered) { warning("[EmployeeInvite] SMS failed after employee create"); return { success: true as const, data: committed.employee, warning: "Employee created but SMS failed to send." }; }
    return { success: true as const, data: committed.employee };
  } catch (error) { return safeFailure(error, "Failed to create employee"); }
}

export async function updateEmployeeAdministration(identity: EmployeeAdministrationIdentity, employeeId: number, data: EmployeeUpdateInput) {
  try {
    const access = await owner(identity); const contact = data.contact_number !== undefined ? normalizedPhone(data.contact_number) : undefined;
    await transaction(identity, access.actor, async (tx, current) => {
      const employee = await target(tx, current, employeeId);
      const joinedChanged = data.employment_start !== undefined && data.employment_start !== (employee.employment_start?.toISOString().slice(0, 10) ?? null);
      if (joinedChanged) {
        if (!await tx.owner.findFirst({ where: { id: current.actor.ownerId!, user_id: identity.userId, business_id: current.actor.businessId, user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } })) throw new EmployeeAdministrationError("Payroll permission is required to change Joined on.");
        const dateError = await employmentDateChangeError(tx, current.actor.businessId, employee, data.employment_start!, data.expectedFinancialRevision);
        if (dateError) throw new EmployeeAdministrationError(dateError);
      }
      if (data.daily_rate !== undefined || data.commission_percentage !== undefined) {
        const payrollOwner = await tx.owner.findFirst({ where: { id: current.actor.ownerId!, user_id: identity.userId, business_id: current.actor.businessId, user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } });
        if (!payrollOwner) throw new EmployeeAdministrationError("Payroll permission is required to change compensation.");
        const payrollSettings = await tx.payrollSettings.findUnique({ where: { business_id: current.actor.businessId }, select: { mode: true } });
        if (payrollSettings && payrollSettings.mode !== "LEGACY") throw new EmployeeAdministrationError("Change compensation through an effective-dated agreement in Payroll setup.");
      }
      if (contact && contact !== employee.user.contact_number) {
        const existing = await tx.user.findUnique({ where: { contact_number: contact }, select: { id: true } });
        if (existing && existing.id !== employee.user_id) throw new EmployeeAdministrationError("Contact number already in use");
      }
      if (data.name || contact) ensureChanged((await tx.user.updateMany({ where: accountWhere(current, employee), data: { ...(data.name && { name: data.name }), ...(contact && { contact_number: contact }) } })).count);
      const profile = data.profile ?? employee.profile ?? StaffProfile.STAFF;
      const permissions = data.permissions !== undefined ? sanitizeStaffPermissions(profile, data.permissions) : data.profile !== undefined ? sanitizeStaffPermissions(profile, undefined) : undefined;
      ensureChanged((await tx.employee.updateMany({ where: { ...employeeAdministrationTargetWhere(current, employeeId), user_id: employee.user_id, profile: employee.profile, permissions: { equals: employee.permissions }, specialties: { equals: employee.specialties }, recurring_days_off: { equals: employee.recurring_days_off }, daily_rate: employee.daily_rate, commission_percentage: employee.commission_percentage, ...(joinedChanged ? { financial_revision: data.expectedFinancialRevision, employment_start: employee.employment_start } : {}) }, data: {
        user_id: employee.user_id,
        ...(joinedChanged ? { employment_start: data.employment_start ? new Date(data.employment_start + "T00:00:00Z") : null, financial_revision: { increment: 1 } } : {}),
        ...(data.daily_rate !== undefined && { daily_rate: data.daily_rate }), ...(data.commission_percentage !== undefined && { commission_percentage: data.commission_percentage }),
        ...(data.specialties !== undefined && { specialties: data.specialties }), ...(data.recurring_days_off !== undefined && { recurring_days_off: daysOff(data.recurring_days_off) }),
        ...(data.profile !== undefined && { profile }), ...(permissions !== undefined && { permissions }),
      } })).count);
      if (joinedChanged) await logAudit(tx, { businessId: current.actor.businessId, actorId: identity.userId, entityType: "Employee", entityId: String(employeeId), action: "UPDATED", changes: { before: { employment_start: employee.employment_start?.toISOString().slice(0, 10) ?? null }, after: { employment_start: data.employment_start ?? null } } });
    });
    if (data.specialties !== undefined) {
      try { await detectAndEmitFutureBookingConflicts({ businessSlug: identity.businessSlug, trigger: "EMPLOYEE_SPECIALTIES_UPDATED" }); }
      catch { warning("[BookingConflicts] Failed after employee specialty update"); }
    }
    return { success: true as const };
  } catch (error) { return safeFailure(error, "Failed to update employee"); }
}

export async function deleteEmployeeAdministration(identity: EmployeeAdministrationIdentity, employeeId: number) {
  try {
    const access = await owner(identity);
    await transaction(identity, access.actor, async (tx, current) => {
      const employee = await target(tx, current, employeeId);
      const foreignEdges = foreignEmployeeDeleteEdges(current.actor.businessId);
      if (await tx.employee.findFirst({ where: { id: employeeId, business_id: current.actor.businessId, OR: foreignEdges }, select: { id: true } })) throw new EmployeeAdministrationError("Employee references are inconsistent. Contact support.");
      ensureChanged((await tx.employee.updateMany({ where: { ...employeeAdministrationTargetWhere(current, employeeId), user_id: employee.user_id, NOT: { OR: foreignEdges } }, data: { archived_at: new Date(), employment_end: getStartOfDayPHForArchive() } })).count);
    });
    return { success: true as const };
  } catch (error) { return safeFailure(error, "Failed to delete employee"); }
}
function getStartOfDayPHForArchive() { return new Date(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) + "T00:00:00Z"); }

export async function resetEmployeeAdministrationPassword(identity: EmployeeAdministrationIdentity, employeeId: number, newPassword: string) {
  try {
    const access = await owner(identity); const employee = await target(prisma, access, employeeId); const hashedPassword = await hash(newPassword, 12);
    await transaction(identity, access.actor, async (tx, current) => {
      const fresh = await target(tx, current, employeeId);
      if (fresh.user_id !== employee.user_id) throw new EmployeeAdministrationError("Employee changed. Please try again.");
      ensureChanged((await tx.user.updateMany({ where: accountWhere(current, employee), data: { hashed_password: hashedPassword, must_change_password: false, temp_password_expires_at: null } })).count);
    });
    return { success: true as const };
  } catch (error) { return safeFailure(error, "Failed to reset password"); }
}

export async function resendEmployeeAdministrationInvite(identity: EmployeeAdministrationIdentity, employeeId: number) {
  try {
    const access = await owner(identity); const employee = await target(prisma, access, employeeId);
    if (!employee.user.contact_number) throw new EmployeeAdministrationError("Employee has no contact number.");
    const password = tempPassword(); const hashedPassword = await hash(password, 12); const expiresAt = new Date(getCurrentDateTimePH().getTime() + TEMP_PASSWORD_TTL_MS);
    await transaction(identity, access.actor, async (tx, current) => {
      const fresh = await target(tx, current, employeeId);
      if (fresh.user_id !== employee.user_id) throw new EmployeeAdministrationError("Employee changed. Please try again.");
      ensureChanged((await tx.user.updateMany({ where: accountWhere(current, employee), data: { hashed_password: hashedPassword, must_change_password: true, temp_password_expires_at: expiresAt } })).count);
    });
    const delivered = await deliverInvite({ to: employee.user.contact_number, employeeName: employee.user.name, businessName: employee.business.name, tempPassword: password, expiresAt });
    if (!delivered) { warning("[EmployeeInvite] SMS failed after password rotation"); return { success: true as const, warning: "Password rotated but SMS failed. Share manually: " + password, tempPassword: password }; }
    return { success: true as const, tempPassword: password };
  } catch (error) { return safeFailure(error, "Failed to resend invite."); }
}

export async function replaceEmployeeAdministrationSchedule(identity: EmployeeAdministrationIdentity, employeeId: number, rows: EmployeeScheduleRow[]) {
  try {
    const access = await owner(identity);
    await transaction(identity, access.actor, async (tx, current) => {
      const employee = await target(tx, current, employeeId); const where = { ...employeeAdministrationTargetWhere(current, employeeId), user_id: employee.user_id };
      ensureChanged((await tx.employee.updateMany({ where, data: { user_id: employee.user_id } })).count);
      await tx.employeeSchedule.deleteMany({ where: { employee_id: employeeId, employee: where } });
      if (rows.length > 0) {
        const inserted = await tx.employeeSchedule.createMany({ data: rows.map(row => ({ ...row, employee_id: employeeId })) });
        if (inserted.count !== rows.length) throw new EmployeeAdministrationError("Employee changed. Please try again.");
      }
    });
    return { success: true as const };
  } catch (error) { return safeFailure(error, "Failed to save schedule."); }
}
