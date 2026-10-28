import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import { currentWorkforceOwner } from "@/features/workforce/workforce-access";
import { runWorkforcePayrollCommand, assertPayrollRevision, PayrollError, type PayrollIdentity } from "@/features/payroll/public";
import { allocateApprovedLeave } from "./leave-allocation";

export const leaveDecisionSchema = z.object({ key: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), requestId: z.number().int().positive(), decision: z.enum(["APPROVED", "REJECTED", "CANCELLED"]), paid: z.boolean(), reason: z.string().trim().min(5).max(1000) });
export async function decideReviewedLeave(identity: PayrollIdentity, input: z.infer<typeof leaveDecisionSchema>) {
  return runWorkforcePayrollCommand(identity, "LEAVE_DECISION", input, async (tx, actor) => {
    const request = await tx.leaveRequest.findFirst({ where: { id: input.requestId, business_id: actor.businessId, cancelled_at: null } });
    if (!request) throw new PayrollError("NOT_FOUND", "Leave request not found.");
    assertPayrollRevision(request.revision, input.expectedRevision);
    if (input.decision === "CANCELLED") {
      const allocations = await tx.leaveAllocation.findMany({ where: { leave_request_id: request.id, business_id: actor.businessId, cancelled_at: null } });
      if (allocations.some(entry => entry.paid_in_payslip_id) || await tx.payrollEarning.findFirst({ where: { business_id: actor.businessId, employee_id: request.employee_id, source_type: { in: ["WORKDAY", "LEAVE_AWARD"] }, earned_on: { in: allocations.map(entry => entry.work_date) }, statement: { is: { status: "PUBLISHED" } } }, select: { id: true } })) throw new PayrollError("BLOCKED", "Published leave remains preserved. Create a linked payroll adjustment.");
      await tx.leaveAllocation.updateMany({ where: { business_id: actor.businessId, leave_request_id: request.id, cancelled_at: null }, data: { cancelled_at: new Date() } });
      const updated = await tx.leaveRequest.update({ where: { id: request.id }, data: { cancelled_at: new Date(), admin_comment: input.reason, revision: { increment: 1 } } });
      return { id: String(updated.id), revision: updated.revision };
    }
    if (request.status !== "PENDING") throw new PayrollError("BLOCKED", "This request was already decided.");
    if (input.decision === "APPROVED") await allocateApprovedLeave(tx, request, input.paid);
    const updated = await tx.leaveRequest.update({ where: { id: request.id }, data: { status: input.decision, is_paid: input.paid, admin_comment: input.reason, revision: { increment: 1 } } });
    return { id: String(updated.id), revision: updated.revision };
  }, "WORKFORCE_MANAGE");
}
export async function leaveReview(identity: PayrollIdentity, page: number) {
  const actor = await currentWorkforceOwner(identity.businessSlug, identity.userId);
  if (!actor) throw new PayrollError("FORBIDDEN", "Forbidden");
  const [requests, employees] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { business_id: actor.business_id, cancelled_at: null, status: { in: ["PENDING", "APPROVED"] } }, orderBy: [{ status: "asc" }, { created_at: "desc" }], take: 26, skip: (page - 1) * 25, include: { employee: { select: { user: { select: { name: true } } } } } }),
    prisma.employee.findMany({ where: { business_id: actor.business_id, archived_at: null }, select: { id: true, financial_revision: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  if (!await currentWorkforceOwner(identity.businessSlug, identity.userId)) throw new PayrollError("FORBIDDEN", "Forbidden");
  return { page, hasMore: requests.length > 25, employees: employees.map(entry => ({ id: entry.id, name: entry.user.name, revision: entry.financial_revision })), requests: requests.slice(0, 25).map(entry => ({ id: entry.id, revision: entry.revision, employeeName: entry.employee.user.name, employeeId: entry.employee_id, start: new Date(entry.start_date.getTime() + 8 * 3600000).toISOString().slice(0, 10), end: new Date(entry.end_date.getTime() + 8 * 3600000).toISOString().slice(0, 10), benefit: entry.benefit_code, reason: entry.reason, status: entry.status, paid: entry.is_paid })) };
}
