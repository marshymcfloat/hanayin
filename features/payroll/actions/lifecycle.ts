"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { PayrollError, type PayrollIdentity, type PayrollCommandResult } from "@/features/payroll/v2/contracts";
import { payrollWorkspace, myPay, pendingAdjustments, myPublishedStatement, readPayNotification } from "@/features/payroll/v2/queries";
import { prepareRun, prepareNextEmployee, refreshStatement, approveStatement, publishStatement, recordPayment, voidStatement, saveSimplePayslip } from "@/features/payroll/v2/lifecycle";
import { saveCompensation, savePayrollProfile, saveSettings, createAdjustment, decideAdjustment, changePayrollMode, availableRulePackages } from "@/features/payroll/v2/setup";
import { prepareRunSchema, runCommandSchema, statementCommandSchema, paymentSchema, compensationSchema, profileSchema, settingsSchema, adjustmentSchema, adjustmentDecisionSchema, activationSchema, simpleSaveSchema, simpleSettingsSchema, simpleAdjustmentSchema } from "@/features/payroll/v2/schemas";
import { saveSimpleSettings, createSimpleAdjustment } from "@/features/payroll/v2/simple-setup";
import { payrollOwner } from "@/features/payroll/v2/access";
import { reconcileLegacySchema, reconcileLegacy } from "@/features/payroll/v2/legacy-reconciliation";
import { previewPaymentDate, reconcilePaymentDate } from "@/features/payroll/v2/payment-reconciliation";
import { paymentReconciliationSchema, decimalString, dateOnly } from "@/features/payroll/v2/schemas";
import { benefitInputSchema, benefitCommandSchema, previewBenefits, recordBenefits } from "@/features/payroll/v2/benefits";
import { historicalCommissionSchema, confirmHistoricalCommission, historicalCommissions } from "@/features/payroll/v2/historical-commissions";

async function execute<S extends z.ZodType>(schema: S, input: unknown, command: (identity: PayrollIdentity, value: z.output<S>) => Promise<PayrollCommandResult>): Promise<PayrollCommandResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, code: "INVALID_INPUT", error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const auth = await requireAuth({ write: true });
  if (!auth.success) return { success: false, code: "FORBIDDEN", error: auth.error };
  const result = await command({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
  if (result.success) for (const destination of ["payroll", "attendance", "employees", "my-pay"]) revalidatePath("/app/" + auth.businessSlug + "/" + destination);
  return result;
}
export async function preparePayrollAction(input: unknown) { return execute(prepareRunSchema, input, prepareRun); }
export async function prepareNextPayrollEmployeeAction(input: unknown) { return execute(runCommandSchema, input, prepareNextEmployee); }
export async function refreshPayrollAction(input: unknown) { return execute(statementCommandSchema, input, refreshStatement); }
export async function approvePayrollAction(input: unknown) { return execute(statementCommandSchema, input, approveStatement); }
export async function publishPayrollAction(input: unknown) { return execute(statementCommandSchema, input, publishStatement); }
export async function voidPayrollAction(input: unknown) { return execute(statementCommandSchema, input, voidStatement); }
export async function recordPayrollPaymentAction(input: unknown) { return execute(paymentSchema, input, recordPayment); }
export async function saveSimplePayslipAction(input: unknown) { return execute(simpleSaveSchema, input, saveSimplePayslip); }
export async function saveSimplePayrollSettingsAction(input: unknown) { return execute(simpleSettingsSchema, input, saveSimpleSettings); }
export async function createSimplePayrollAdjustmentAction(input: unknown) { return execute(simpleAdjustmentSchema, input, createSimpleAdjustment); }
export async function saveCompensationAction(input: unknown) { return execute(compensationSchema, input, saveCompensation); }
export async function savePayrollProfileAction(input: unknown) { return execute(profileSchema, input, savePayrollProfile); }
export async function savePayrollSettingsAction(input: unknown) { return execute(settingsSchema, input, saveSettings); }
export async function createPayrollAdjustmentAction(input: unknown) { return execute(adjustmentSchema, input, createAdjustment); }
export async function decidePayrollAdjustmentAction(input: unknown) { return execute(adjustmentDecisionSchema, input, decideAdjustment); }
export async function activatePayrollAction(input: unknown) { return execute(activationSchema, input, changePayrollMode); }
export async function reconcileLegacyPayrollAction(input: unknown) { return execute(reconcileLegacySchema, input, reconcileLegacy); }
export async function confirmHistoricalPayrollCommissionAction(input: unknown) { return execute(historicalCommissionSchema, input, confirmHistoricalCommission); }
export async function reconcilePayrollPaymentDateAction(input: unknown) { return execute(paymentReconciliationSchema, input, reconcilePaymentDate); }
export async function recordPayrollBenefitsAction(input: unknown) { return execute(benefitCommandSchema, input, recordBenefits); }
export async function previewPayrollBenefitsAction(input: unknown) {
  const parsed = benefitInputSchema.safeParse(input); if (!parsed.success) return { success: false as const, error: "Verify the benefit date and eligibility evidence." };
  const auth = await requireAuth(); if (!auth.success) return auth;
  try { return { success: true as const, data: await previewBenefits({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Benefit calculation is unavailable." }; }
}
export async function previewPayrollPaymentDateAction(input: unknown) {
  const parsed = z.object({ statementId: z.string().uuid(), date: dateOnly, amount: decimalString }).safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Check the payment amount and date." };
  const auth = await requireAuth(); if (!auth.success) return auth;
  try { return { success: true as const, data: await previewPaymentDate({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data.statementId, parsed.data.date, parsed.data.amount) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Payment-date reconciliation is unavailable." }; }
}
export async function getPayrollWorkspaceAction(page = 1) {
  const auth = await requireAuth();
  if (!auth.success) return { success: false as const, error: auth.error };
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return { success: false as const, error: "Invalid page" };
  try {
    const identity = { businessSlug: auth.businessSlug, userId: auth.session.user.id };
    const [data, adjustments, packages, historical] = await Promise.all([payrollWorkspace(identity, page), pendingAdjustments(identity), availableRulePackages(), historicalCommissions(identity)]);
    return { success: true as const, data, adjustments, historical, packages: packages.map(entry => ({ id: entry.id, certified: Boolean(entry.certified_at) })) };
  } catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Payroll is unavailable." }; }
}
export async function getMyPayAction(page = 1) {
  const auth = await requireAuth();
  if (!auth.success) return { success: false as const, error: auth.error };
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return { success: false as const, error: "Invalid page" };
  try { return { success: true as const, data: await myPay({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, page) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Pay records are unavailable." }; }
}
export async function checkPayrollAccessAction() {
  const auth = await requireAuth(); if (!auth.success) return { success: false as const };
  try { await payrollOwner({ businessSlug: auth.businessSlug, userId: auth.session.user.id }); return { success: true as const }; } catch { return { success: false as const }; }
}
export async function getMyPublishedStatementAction(statementId: string) {
  if (!z.string().uuid().safeParse(statementId).success) return { success: false as const, error: "Invalid payslip." };
  const auth = await requireAuth(); if (!auth.success) return auth;
  try {
    const identity = { businessSlug: auth.businessSlug, userId: auth.session.user.id };
    const statement = await myPublishedStatement(identity, statementId);
    if (!statement) return { success: false as const, error: "Published payslip unavailable." };
    await readPayNotification(identity, statementId);
    return { success: true as const, data: statement };
  } catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Published payslip unavailable." }; }
}
