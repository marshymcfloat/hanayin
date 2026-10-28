import "server-only";

import { isIP } from "node:net";
import { assistantBookingPath, MAX_ASSISTANT_REPLY_LENGTH } from "@/features/social/conversation-assistant/reply-builder";

/** Accept only an explicitly supplied server-approved public HTTPS origin. */
export function messagingPublicOrigin(value: string | null | undefined): string | null {
  if (!value || value.length > 2_048 || value !== value.trim() || !/^https:\/\//i.test(value)
    || /[\\?#\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const address = hostname.replace(/^\[|\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/"
      || isIP(address) || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)
      || /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|test|invalid|onion)$/.test(hostname)) return null;
    return url.origin;
  } catch { return null; }
}

/** Only the last app-written booking suffix changes; catalog text stays verbatim. */
export function absoluteMessagingBookingLink(reply: string, businessSlug: string, trustedOrigin: string): string | null {
  const origin = messagingPublicOrigin(trustedOrigin);
  if (!origin) return null;
  const path = assistantBookingPath(businessSlug);
  const marker = ` ${path}\n`;
  const index = reply.lastIndexOf(marker);
  if (index < 0) return null;
  const preceding = reply.slice(0, index);
  if (!/(?:\nThis does not create or reserve a booking\. Book:|\nWala pang booking o reserbasyon\. Mag-book:|\nWala pang booking o reservation\. Book here:)$/.test(preceding)) return null;
  const absolute = `${origin}${path}`;
  const result = reply.slice(0, index + 1) + absolute + reply.slice(index + 1 + path.length);
  return result.length <= MAX_ASSISTANT_REPLY_LENGTH ? result : null;
}
