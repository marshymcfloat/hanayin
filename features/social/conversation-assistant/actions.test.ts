import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), entitlements: vi.fn(), facts: vi.fn(), preview: vi.fn(), available: vi.fn() }));
vi.mock("@/lib/auth/owner-access", () => ({ requireOwnerPermission: mocks.access }));
vi.mock("@/features/billing/plan-entitlements", () => ({ getBusinessEntitlementsBySlug: mocks.entitlements }));
vi.mock("@/features/social/conversation-assistant/facts", () => ({ getAssistantPublicFacts: mocks.facts }));
vi.mock("@/features/social/conversation-assistant/preview-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/social/conversation-assistant/preview-service")>();
  return { ...original, previewOwnerAssistantReply: mocks.preview, isOwnerAssistantAiPreviewAvailable: mocks.available };
});
import { getOwnerAssistantLabContextAction, simulateOwnerAssistantReplyAction } from "@/features/social/conversation-assistant/actions";

const tenant = { businessId: "lab-business", businessSlug: "lab-studio" };
const facts = { ...tenant, name: "Lab Studio", timezone: "Asia/Manila", generatedAt: "2026-10-04T04:00:00Z", services: [], hours: [] };
const input = { businessSlug: "lab-studio", mode: "POLICY", message: "What are your hours?", scenario: "hours", serviceId: null, date: null, elapsedSeconds: 120, humanReplied: false, paused: false, optedOut: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ success: true, context: { ...tenant, userId: "lab-owner", ownerId: 3, actorType: "OWNER" } });
  mocks.entitlements.mockResolvedValue({ social: true, ai: true });
  mocks.facts.mockResolvedValue(facts);
  mocks.preview.mockResolvedValue({ result: { mode: "DRY_RUN", sent: false, status: "PROPOSED", reason: "SAFE_PROPOSAL", reply: "Public hours", eligibleAt: null }, decisionSource: "OWNER_SELECTED_SCENARIO", factsGeneratedAt: facts.generatedAt });
  mocks.available.mockReturnValue(false);
});

describe("owner assistant action boundary", () => {
  it("derives a narrow tenant from current settings-authorized owner membership", async () => {
    const response = await getOwnerAssistantLabContextAction({ businessSlug: "lab-studio" });
    expect(response.success).toBe(true);
    expect(mocks.access).toHaveBeenCalledWith("lab-studio", "SETTINGS_MANAGE");
    expect(mocks.facts).toHaveBeenCalledWith(tenant);
    expect(response).toEqual({ success: true, data: { facts, aiPreviewAvailable: false, liveEnabled: false } });
    await simulateOwnerAssistantReplyAction(input);
    expect(mocks.preview).toHaveBeenCalledWith(tenant, "lab-owner", input, true);
  });

  it.each(["Unauthorized", "Forbidden", "Subscription is read only"])("stops %s actors before facts and provider work", async (error) => {
    mocks.access.mockResolvedValue({ success: false, error });
    expect(await getOwnerAssistantLabContextAction({ businessSlug: "lab-studio" })).toEqual({ success: false, error });
    expect(await simulateOwnerAssistantReplyAction(input)).toEqual({ success: false, error });
    expect(mocks.entitlements).not.toHaveBeenCalled();
    expect(mocks.facts).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("passes the requested slug only to the tenant-checking guard and denies a foreign tenant", async () => {
    mocks.access.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await simulateOwnerAssistantReplyAction({ ...input, businessSlug: "foreign-studio" })).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.access).toHaveBeenCalledWith("foreign-studio", "SETTINGS_MANAGE");
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it.each([
    { businessId: "foreign" }, { facts: { secret: "untrusted" } }, { decision: { intent: "services" } },
    { message: "x".repeat(1001) }, { elapsedSeconds: -1 }, { elapsedSeconds: 86401 },
    { serviceId: 0 }, { date: "2026-02-31" },
  ])("rejects untrusted or unbounded input before authorization %j", async (change) => {
    expect((await simulateOwnerAssistantReplyAction({ ...input, ...change })).success).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("enforces social entitlement and AI entitlement independently", async () => {
    mocks.entitlements.mockResolvedValue({ social: false, ai: true });
    expect((await getOwnerAssistantLabContextAction({ businessSlug: "lab-studio" })).success).toBe(false);
    expect((await simulateOwnerAssistantReplyAction(input)).success).toBe(false);
    expect(mocks.preview).not.toHaveBeenCalled();
    mocks.entitlements.mockResolvedValue({ social: true, ai: false });
    expect((await simulateOwnerAssistantReplyAction({ businessSlug: "lab-studio", mode: "AI", message: "Hours?", consentForExternalProcessing: true, elapsedSeconds: 120, humanReplied: false, paused: false, optedOut: false })).success).toBe(false);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("does not expose internal facts errors or raw extra projection fields", async () => {
    mocks.facts.mockResolvedValue({ ...facts, payroll: "sensitive" });
    const response = await getOwnerAssistantLabContextAction({ businessSlug: "lab-studio" });
    expect(response).toEqual({ success: false, error: "Assistant preview facts are unavailable. Please retry." });
    expect(JSON.stringify(response)).not.toMatch(/payroll|sensitive/);
  });

  it("maps infrastructure failures to safe, retryable errors", async () => {
    mocks.preview.mockRejectedValue(new Error("postgres SQL internal token"));
    const response = await simulateOwnerAssistantReplyAction(input);
    expect(response).toEqual({ success: false, error: "Assistant preview could not run. Check the service/date and retry." });
    expect(JSON.stringify(response)).not.toMatch(/postgres|SQL|token/);
  });
});
