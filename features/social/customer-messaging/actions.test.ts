import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), settings: vi.fn(), takeover: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/features/social/customer-messaging/access", () => ({ requireOwnerInboxAccess: mocks.access }));
vi.mock("@/features/social/customer-messaging/inbox-service", () => ({ updateSettings: mocks.settings, setConversationTakeover: mocks.takeover }));
import { setOwnerInboxTakeoverAction, updateOwnerInboxSettingsAction } from "@/features/social/customer-messaging/actions";

const settings = { mode: "OFF", consent: false, aiConsent: false, paused: false, defaultLanguage: "TAGLISH" };
const input = { businessSlug: "studio-a", settings };
const takeover = { businessSlug: "studio-a", conversationId: "conversation-a", takeover: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ success: true, context: { businessId: "verified-business", businessSlug: "studio-a", userId: "verified-owner" } });
  mocks.settings.mockResolvedValue(settings);
  mocks.takeover.mockResolvedValue(true);
});

describe("owner customer inbox actions", () => {
  it("accepts default off settings and derives tenant/actor identity from the guard", async () => {
    expect(await updateOwnerInboxSettingsAction(input)).toEqual({ success: true, data: settings });
    expect(mocks.access).toHaveBeenCalledWith("studio-a", false);
    expect(mocks.settings).toHaveBeenCalledWith("verified-business", "verified-owner", settings);
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/studio-a/inbox");
  });

  it.each([{ businessId: "foreign" }, { settings: { ...settings, mode: "AUTO", consent: false } }, { settings: { ...settings, token: "untrusted" } }])("rejects untrusted input before access checks %j", async (change) => {
    expect((await updateOwnerInboxSettingsAction({ ...input, ...change })).success).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it("requires independent AI entitlement and explicit external processing consent", async () => {
    expect((await updateOwnerInboxSettingsAction({ ...input, settings: { ...settings, mode: "SUGGEST", consent: true } })).success).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
    mocks.access.mockResolvedValueOnce({ success: false, reason: "AI_REQUIRED", error: "AI access required." });
    expect((await updateOwnerInboxSettingsAction({ ...input, settings: { ...settings, mode: "AUTO", consent: true, aiConsent: true } })).success).toBe(false);
    expect(mocks.access).toHaveBeenCalledWith("studio-a", true);
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it("checks takeover authorization independently and never trusts client tenant identity", async () => {
    expect(await setOwnerInboxTakeoverAction(takeover)).toEqual({ success: true });
    expect(mocks.takeover).toHaveBeenCalledWith("verified-business", "verified-owner", "conversation-a", true);
    mocks.access.mockResolvedValueOnce({ success: false, reason: "FORBIDDEN", error: "Access revoked." });
    expect((await setOwnerInboxTakeoverAction({ ...takeover, takeover: false })).success).toBe(false);
    expect(mocks.takeover).toHaveBeenCalledTimes(1);
  });

  it("does not report persistence or delivery success after a failure", async () => {
    mocks.settings.mockRejectedValueOnce(new Error("provider token SQL internal"));
    const response = await updateOwnerInboxSettingsAction(input);
    expect(response.success).toBe(false);
    expect(JSON.stringify(response)).not.toMatch(/token|SQL|internal/);
    mocks.takeover.mockResolvedValueOnce(false);
    expect((await setOwnerInboxTakeoverAction(takeover)).success).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
