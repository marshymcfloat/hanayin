import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConversationDetail, getInboxSnapshot, updateSettings } from "@/features/social/customer-messaging/inbox-service";

const db = vi.hoisted(() => ({
  messengerChannel: { findMany: vi.fn() }, customerMessagingSettings: { findUnique: vi.fn() },
  customerConversation: { findMany: vi.fn(), findFirst: vi.fn() }, customerMessage: { findMany: vi.fn() },
  customerMessagingJob: { updateMany: vi.fn(), findFirst: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("owner inbox safe read model", () => {
  it("reports missing setup and unknown provider proofs without querying or inventing conversations", async () => {
    const snapshot = await getInboxSnapshot("verified-tenant");
    expect(snapshot).toMatchObject({ setupStatus: "SETUP_REQUIRED", settings: { mode: "OFF" }, canEnableAuto: false,
      channel: null, conversations: [] });
    expect(snapshot.readinessReasons).toEqual(expect.arrayContaining([
      "ENCRYPTION_UNAVAILABLE", "CHANNEL_UNVERIFIED", "PERMISSIONS_UNVERIFIED", "PILOT_UNVERIFIED",
    ]));
    expect(db.messengerChannel.findMany).not.toHaveBeenCalled();
    expect(db.customerConversation.findMany).not.toHaveBeenCalled();
  });
  it("rejects detail and mutations when encryption setup is unavailable", async () => {
    await expect(getConversationDetail("verified-tenant", "conversation")).rejects.toThrow("Customer inbox setup is required.");
    await expect(updateSettings("verified-tenant", "owner", {
      mode: "AUTO", consent: true, aiConsent: true, paused: false, defaultLanguage: "FIL",
    })).rejects.toThrow("Customer inbox setup is required.");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(["https://example.com:8443", "https://private.internal", "https://127.0.0.1", ""])("does not present an unsafe public booking origin as configured: %s", async (url) => {
    vi.stubEnv("SOCIAL_MESSAGING_PUBLIC_BASE_URL", url);
    const snapshot = await getInboxSnapshot("verified-tenant");
    expect(snapshot.readinessReasons).toContain("PUBLIC_URL_UNCONFIGURED");
    expect(snapshot.canEnableAuto).toBe(false);
  });
  it("returns the same safe null result for absent and foreign conversations with tenant filtering", async () => {
    vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    db.customerConversation.findFirst.mockResolvedValue(null);
    await expect(getConversationDetail("verified-tenant", "foreign-conversation")).resolves.toBeNull();
    expect(db.customerConversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      business_id: "verified-tenant", id: "foreign-conversation",
    }) }));
    expect(db.customerMessage.findMany).not.toHaveBeenCalled();
  });
  it("never exposes underlying database errors", async () => {
    vi.stubEnv("SOCIAL_MESSAGING_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    db.messengerChannel.findMany.mockRejectedValue(new Error("synthetic-private-SQL-token"));
    const snapshot = await getInboxSnapshot("verified-tenant");
    expect(snapshot.readinessReasons).toContain("SCHEMA_UNAVAILABLE");
    expect(JSON.stringify(snapshot)).not.toContain("synthetic-private");
  });
});
