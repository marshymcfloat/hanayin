"use server";

import { formatPH } from "@/lib/date-utils";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";
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

  // Login URL goes last so SMS truncation never eats the credentials.
  // truncateSms caps at 160 chars to stay inside one segment; if the
  // URL pushes us over the message still contains the password.
  const message = truncateSms(
    `Hi ${firstName}, you're added to ${businessName} on ServiceFlow. ` +
      `Temp password: ${tempPassword}. ` +
      `Sign in at ${loginUrl} before ${expiry}.`,
  );

  const result = await sendSemaphorePrioritySms(to, message);

  if (!result.success) {
    return { success: false as const, error: result.error };
  }

  return { success: true as const, messageId: result.messageId };
}
