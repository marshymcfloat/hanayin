"use server";

import { formatPH } from "@/lib/date-utils";
import { sendSemaphorePrioritySms } from "@/lib/services/sms";
import { getSiteUrl } from "@/lib/site-url";

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
  const loginUrl = `${getSiteUrl()}/login`;

  // Keep the complete URL and password. Semaphore can deliver a
  // concatenated SMS when the business name makes this exceed one segment.
  const message =
    `Hi ${firstName}, you're added to ${businessName} on ServiceFlow. ` +
    `Sign in: ${loginUrl} Temp password: ${tempPassword}. ` +
    `Expires ${expiry}.`;

  const result = await sendSemaphorePrioritySms(to, message);

  if (!result.success) {
    return { success: false as const, error: result.error };
  }

  return { success: true as const, messageId: result.messageId };
}
