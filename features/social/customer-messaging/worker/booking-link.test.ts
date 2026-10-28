// @vitest-environment node
import { describe, expect, it } from "vitest";
import { absoluteMessagingBookingLink, messagingPublicOrigin } from "@/features/social/customer-messaging/worker/booking-link";
import { buildAssistantReply } from "@/features/social/conversation-assistant/reply-builder";

describe("live-only trusted booking links", () => {
  it("keeps the lab relative and replaces only its exact app-written suffix", () => {
    const now = "2026-10-05T01:02:00Z";
    const reply = buildAssistantReply({ now,
      facts: { businessId: "a", businessSlug: "studio-a", name: "Studio", timezone: "Asia/Manila", generatedAt: now,
        services: [{ id: 1, name: "/studio-a/booking", category: "Nails", price: 280, durationMinutes: 30 }], hours: [] },
      decision: { intent: "services", intentConfidence: 1, serviceId: 1, serviceConfidence: 1, date: null, dateConfidence: 1 },
    }).reply!;
    expect(reply).toContain("Book: /studio-a/booking"); expect(reply).not.toContain("https://");
    const live = absoluteMessagingBookingLink(reply, "studio-a", "https://app.example.com/");
    expect(live).toContain("Book: https://app.example.com/studio-a/booking");
    expect(live).toContain("/studio-a/booking · Nails · base price ₱280");
    expect(live?.match(/https:\/\/app\.example\.com/g)).toHaveLength(1);
  });
  it.each(["https://2130706433", "https://192.168.1.1", "https://169.254.169.254", "https://[fd00::1]", "https://localhost.example.local", "https://intranet", "https://app.example.com:444", "https://app.example.com?", "https://app.example.com#", " https://app.example.com", "https://app.example.com\\other"])("rejects local/private or malformed base %s", base => {
    expect(messagingPublicOrigin(base)).toBeNull();
  });
  it("rejects a non-template path and reply overflow rather than altering factual data", () => {
    expect(absoluteMessagingBookingLink("Catalog /studio-a/booking\n", "studio-a", "https://app.example.com")).toBeNull();
    const reply = `${"a".repeat(1180)}\nThis does not create or reserve a booking. Book: /studio-a/booking\nReply human`;
    expect(absoluteMessagingBookingLink(reply, "studio-a", "https://app.example.com")).toBeNull();
  });
});
