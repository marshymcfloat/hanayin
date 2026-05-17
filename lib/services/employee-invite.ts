"use server";

import { formatPH } from "@/lib/date-utils";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";

export async function sendEmployeeInviteSms({
  to,
  employeeName,
  businessName,
  tempPassword,
  expiresAt,
}: {
  to: string;
  employeeName: string;
  businessName: string;
  tempPassword: string;
  expiresAt: Date;
}) {
  const expiry = formatPH(expiresAt, "MMM d, h:mm a");
  const firstName = employeeName.trim().split(/\s+/)[0] || employeeName;

  const message = truncateSms(
    `Hi ${firstName}, you're added to ${businessName} on ServiceFlow. ` +
      `Temporary password: ${tempPassword}. ` +
      `Sign in with your phone number and change it before ${expiry}.`,
  );

  const result = await sendSemaphorePrioritySms(to, message);

  if (!result.success) {
    return { success: false as const, error: result.error };
  }

  return { success: true as const, messageId: result.messageId };
}
