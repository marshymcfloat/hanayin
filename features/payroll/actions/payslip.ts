"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { getPayrollOwnerBusinessId } from "@/features/payroll/payroll-access";
import { createPayslipSchema, payrollEmployeeIdSchema } from "@/features/payroll/schemas";
import {
  createPayslip,
  getEmployeePayslipAudit,
  getPayrollCallerEmployee,
  getPayslipHistory,
  getPayslipPreview,
} from "@/features/payroll/services/payslip";

export async function getPayslipDataAction(employeeId: number) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  if (!payrollEmployeeIdSchema.safeParse(employeeId).success) {
    return { success: false, error: "Invalid employee" };
  }
  try {
    if (auth.session.user.role === Role.EMPLOYEE) {
      const caller = await getPayrollCallerEmployee(auth.session.user.id, auth.businessSlug);
      if (!caller || caller.id !== employeeId) {
        return { success: false, error: "Unauthorized: You can only view your own payslips." };
      }
    } else if (auth.session.user.role !== Role.OWNER || !await getPayrollOwnerBusinessId(auth.businessSlug, auth.session.user.id)) {
      return { success: false, error: "Forbidden" };
    }
    return await getPayslipPreview(employeeId, auth.businessSlug);
  } catch {
    return { success: false, error: "Failed to calculate payslip" };
  }
}

export async function createPayslipAction(data: {
  employeeId: number;
  deduction?: number;
  comment?: string;
}) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false, error: "Unauthorized: Only owners can create payslips." };
  }
  const parsed = createPayslipSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: "Invalid payslip input" };
  try {
    if (!await getPayrollOwnerBusinessId(auth.businessSlug, auth.session.user.id)) {
      return { success: false, error: "Forbidden" };
    }
    const result = await createPayslip(parsed.data, {
      businessSlug: auth.businessSlug,
      actorId: auth.session.user.id,
    });
    if (result.success) revalidatePath(`/app/${auth.businessSlug}/payroll`);
    return result;
  } catch {
    return { success: false, error: "Failed to create payslip" };
  }
}

export async function getEmployeePayslipAuditAction(employeeId: number) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  if (!payrollEmployeeIdSchema.safeParse(employeeId).success) {
    return { success: false, error: "Invalid employee" };
  }
  try {
    if (auth.session.user.role === Role.OWNER) {
      if (!await getPayrollOwnerBusinessId(auth.businessSlug, auth.session.user.id)) {
        return { success: false, error: "Forbidden" };
      }
    } else if (auth.session.user.role === Role.EMPLOYEE) {
      const caller = await getPayrollCallerEmployee(auth.session.user.id, auth.businessSlug);
      if (!caller || caller.id !== employeeId) return { success: false, error: "Forbidden" };
    } else {
      return { success: false, error: "Forbidden" };
    }
    return await getEmployeePayslipAudit(employeeId, auth.businessSlug);
  } catch {
    return { success: false, error: "Failed to fetch payslip audit" };
  }
}

export async function getPayslipHistoryAction(employeeId: number) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  if (!payrollEmployeeIdSchema.safeParse(employeeId).success) {
    return { success: false, error: "Invalid employee" };
  }
  try {
    if (auth.session.user.role === Role.EMPLOYEE) {
      const caller = await getPayrollCallerEmployee(auth.session.user.id, auth.businessSlug);
      if (!caller || caller.id !== employeeId) return { success: false, error: "Unauthorized" };
    } else if (auth.session.user.role !== Role.OWNER || !await getPayrollOwnerBusinessId(auth.businessSlug, auth.session.user.id)) {
      return { success: false, error: "Forbidden" };
    }
    return await getPayslipHistory(employeeId, auth.businessSlug);
  } catch {
    return { success: false, error: "Failed to fetch payslip history" };
  }
}
