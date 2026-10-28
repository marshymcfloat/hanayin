import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import { amount, decimal } from "@/features/payroll/money";
import { payrollOwner } from "./access";
import { payrollCommand, stale } from "./command";
import { commandEnvelope, dateOnly, decimalString } from "./schemas";
import { PayrollError, type PayrollIdentity } from "./contracts";
import { day, phDay } from "./period";

export const historicalCommissionSchema = commandEnvelope.extend({ serviceId: z.number().int().positive(), rate: decimalString.refine(value => Number(value) >= 0 && Number(value) <= 100), base: decimalString.refine(value => Number(value) >= 0), payableOn: dateOnly.optional(), evidence: z.string().trim().min(10).max(1000) });
export async function historicalCommissions(identity: PayrollIdentity) {
  const actor = await payrollOwner(identity);
  const where = { booking: { business_id: actor.businessId }, served_by: { is: { business_id: actor.businessId } }, status: "COMPLETED" as const, cancelled_at: null, paid_in_payslip_id: null, OR: [{ payroll_commission_base: null }, { payroll_commission_rate: null }] };
  const [records, count] = await Promise.all([prisma.availedService.findMany({ where, orderBy: { id: "asc" }, take: 25, include: { served_by: { select: { user: { select: { name: true } } } }, booking: { select: { payment_status: true, amount_paid: true, grand_total: true } } } }), prisma.availedService.count({ where })]);
  await payrollOwner(identity);
  return { count, records: records.map(entry => ({ id: entry.id, revision: entry.payroll_revision, employeeId: entry.served_by_id!, employeeName: entry.served_by!.user.name, earnedOn: entry.completed_at ? phDay(entry.completed_at) : null, recordedBase: amount(entry.commission_base), paid: entry.booking.payment_status === "PAID" && entry.booking.amount_paid >= entry.booking.grand_total })) };
}
export async function confirmHistoricalCommission(identity: PayrollIdentity, input: z.infer<typeof historicalCommissionSchema>) {
  return payrollCommand(identity, "HISTORICAL_COMMISSION", input, async (tx, actor) => {
    const entry = await tx.availedService.findFirst({ where: { id: input.serviceId, booking: { business_id: actor.businessId }, served_by: { is: { business_id: actor.businessId } }, status: "COMPLETED", cancelled_at: null, paid_in_payslip_id: null }, select: { id: true, completed_at: true, served_by_id: true, payroll_revision: true, payroll_commission_rate: true, payroll_commission_base: true, booking: { select: { payment_status: true, amount_paid: true, grand_total: true } } } });
    if (!entry?.completed_at || !entry.served_by_id) throw new PayrollError("NOT_FOUND", "Completed employee work not found.");
    stale(entry.payroll_revision, input.expectedRevision);
    if (entry.payroll_commission_base !== null && entry.payroll_commission_rate !== null) throw new PayrollError("BLOCKED", "This commission already has captured evidence.");
    const paid = entry.booking.payment_status === "PAID" && entry.booking.amount_paid >= entry.booking.grand_total;
    if (paid && !input.payableOn) throw new PayrollError("BLOCKED", "Confirm the date the customer fully paid this historical work.");
    if (input.payableOn && (!paid || input.payableOn < phDay(entry.completed_at) || input.payableOn > phDay(new Date()))) throw new PayrollError("INVALID_INPUT", "Verify the actual customer-payment eligibility date.");
    await tx.availedService.update({ where: { id: entry.id }, data: { payroll_commission_rate: decimal(input.rate), payroll_commission_base: decimal(input.base), payroll_commission_basis: "HISTORICAL_OWNER_CONFIRMED", payroll_payable_at: input.payableOn ? day(input.payableOn) : null } });
    const earning = await tx.payrollEarning.findFirst({ where: { business_id: actor.businessId, source_type: "SERVICE", source_id: String(entry.id), reversed_at: null, statement_id: null }, select: { id: true, snapshot: true } });
    if (earning) await tx.payrollEarning.update({ where: { id: earning.id }, data: { snapshot: { ...(earning.snapshot as object), authorization: input.evidence, confirmedBy: actor.userId, historicalConfirmation: true } } });
    return { id: String(entry.id) };
  });
}
