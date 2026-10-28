import "server-only";
import { prisma } from "@/prisma/prisma";
import { toAbsoluteUrl } from "@/lib/site-url";
import { sendSemaphoreSms, truncateSms } from "@/lib/services/sms";

export async function deliverPayrollNotification(businessId: string, payload: { statementId: string; userId: string }) {
  const notification = await prisma.payrollNotification.findFirst({ where: { business_id: businessId, statement_id: payload.statementId, user_id: payload.userId }, include: { statement: { include: { employee: { include: { user: { select: { id: true, contact_number: true, role: true } }, business: { select: { slug: true } } } } } } } });
  if (!notification || notification.statement.status !== "PUBLISHED" || notification.statement.employee.business_id !== businessId || notification.statement.employee.user_id !== payload.userId || notification.statement.employee.user.role !== "EMPLOYEE" || notification.statement.employee.archived_at) return { status: "NON_RETRYABLE" as const, error: "Payslip recipient is unavailable." };
  if (notification.sms_state === "ACCEPTED" || notification.sms_state === "NOT_REQUESTED") return { status: "DONE" as const };
  if (["SENDING", "UNKNOWN"].includes(notification.sms_state)) {
    await prisma.payrollNotification.update({ where: { id: notification.id }, data: { sms_state: "UNKNOWN", sms_last_error: "Provider reconciliation required before retry." } });
    return { status: "NON_RETRYABLE" as const, error: "Payroll SMS acceptance is unknown; provider reconciliation is required." };
  }
  const claimed = await prisma.payrollNotification.updateMany({ where: { id: notification.id, sms_state: notification.sms_state }, data: { sms_state: "SENDING", sms_attempts: { increment: 1 } } });
  if (claimed.count !== 1) return { status: "NON_RETRYABLE" as const, error: "Another worker owns this payroll SMS." };
  const link = toAbsoluteUrl("/app/" + notification.statement.employee.business.slug + "/my-pay?statement=" + notification.statement_id);
  let result: Awaited<ReturnType<typeof sendSemaphoreSms>>;
  try { result = await sendSemaphoreSms(notification.statement.employee.user.contact_number, truncateSms("Your payslip is available. Sign in to view it: " + link)); }
  catch { await prisma.payrollNotification.update({ where: { id: notification.id }, data: { sms_state: "UNKNOWN", sms_last_error: "Provider reconciliation required before retry." } }); return { status: "NON_RETRYABLE" as const, error: "Payroll SMS acceptance is unknown; provider reconciliation is required." }; }
  await prisma.payrollNotification.update({ where: { id: notification.id }, data: { sms_state: result.success ? "ACCEPTED" : result.failureKind === "UNKNOWN" ? "UNKNOWN" : "FAILED", sms_message_id: result.messageId ?? null, sms_last_error: result.success ? null : "SMS provider did not confirm acceptance." } });
  return result.success ? { status: "DONE" as const } : result.failureKind === "UNKNOWN" ? { status: "NON_RETRYABLE" as const, error: "Payroll SMS acceptance is unknown; provider reconciliation is required." } : { status: "RETRY" as const, error: "Payroll SMS was rejected." };
}
