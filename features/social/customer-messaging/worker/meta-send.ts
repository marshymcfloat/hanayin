import "server-only";

import { z } from "zod";
import { MAX_ASSISTANT_REPLY_LENGTH } from "@/features/social/conversation-assistant/reply-builder";
import { readBoundedProviderJson } from "@/features/social/customer-messaging/worker/provider-response";

export type MessengerSendOutcome =
  | { status: "CONFIRMED"; providerMessageId: string }
  | { status: "FAILED"; retryable: false }
  | { status: "UNKNOWN" };

export type VerifiedMessengerSendTarget = {
  pageId: string;
  recipientId: string;
  pageAccessToken: string;
  graphVersion: string;
  facebookLoginVerified: boolean;
  permissionsVerified: boolean;
  pilotVerified: boolean;
  metadataEchoVerified: boolean;
};

const targetSchema = z.object({
  pageId: z.string().regex(/^\d{1,30}$/), recipientId: z.string().regex(/^\d{1,30}$/),
  pageAccessToken: z.string().min(1).max(4_000), graphVersion: z.string().regex(/^v\d{1,2}\.\d{1,2}$/),
  facebookLoginVerified: z.literal(true), permissionsVerified: z.literal(true), pilotVerified: z.literal(true),
  metadataEchoVerified: z.boolean(),
}).strict();
const successSchema = z.object({ recipient_id: z.string(), message_id: z.string().min(1).max(200) });
const errorSchema = z.object({ error: z.object({ code: z.number().int(), type: z.string() }) });
const TIMEOUT_MS = 8_000;

/** No retries. Timeout/invalid response may follow an accepted send and remain unknown. */
export async function sendMessengerReply(input: {
  target: VerifiedMessengerSendTarget; text: string; deliveryKey: string;
}, options: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<MessengerSendOutcome> {
  const targetResult = targetSchema.safeParse(input.target);
  if (!targetResult.success || !input.text.trim() || input.text.length > MAX_ASSISTANT_REPLY_LENGTH
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.deliveryKey)) return { status: "FAILED", retryable: false };
  const target = targetResult.data;
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = async () => {
      const response = await (options.fetch ?? fetch)(`https://graph.facebook.com/${target.graphVersion}/${target.pageId}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${target.pageAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: target.recipientId }, messaging_type: "RESPONSE",
          message: { text: input.text, ...(target.metadataEchoVerified ? { metadata: `sf:${input.deliveryKey}` } : {}) } }),
        cache: "no-store", redirect: "error", signal: controller.signal,
      });
      const payload = await readBoundedProviderJson(response);
      if (response.ok) {
        const parsed = successSchema.safeParse(payload);
        return parsed.success && parsed.data.recipient_id === target.recipientId
          ? { status: "CONFIRMED" as const, providerMessageId: parsed.data.message_id }
          : { status: "UNKNOWN" as const };
      }
      // Only a valid explicit client rejection is a confirmed failure. Server errors are uncertain.
      return response.status >= 400 && response.status < 500 && errorSchema.safeParse(payload).success
        ? { status: "FAILED" as const, retryable: false as const } : { status: "UNKNOWN" as const };
    };
    return await Promise.race([request(), new Promise<MessengerSendOutcome>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve({ status: "UNKNOWN" }); }, timeoutMs);
    })]);
  } catch {
    return { status: "UNKNOWN" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
