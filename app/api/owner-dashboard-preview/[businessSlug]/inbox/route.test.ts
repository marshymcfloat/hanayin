import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), snapshot: vi.fn(), detail: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/features/social/customer-messaging/access", () => ({ requireOwnerInboxAccess: mocks.access }));
vi.mock("@/features/social/customer-messaging/inbox-service", () => ({ getInboxSnapshot: mocks.snapshot, getConversationDetail: mocks.detail }));
import { GET } from "./route";

const params = (businessSlug = "studio-a") => ({ params: Promise.resolve({ businessSlug }) });
const request = (query = "") => new Request(`http://localhost/api/owner-dashboard-preview/studio-a/inbox${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "studio-a" } });
  mocks.access.mockResolvedValue({ success: true, context: { businessId: "verified-business" }, aiEntitled: false });
  mocks.snapshot.mockResolvedValue({ setupStatus: "SETUP_REQUIRED", settings: { mode: "OFF" }, conversations: [] });
  mocks.detail.mockResolvedValue({ conversation: { id: "conversation-a" }, messages: [], draft: null, deliveryTruth: "NONE" });
});

describe("owner inbox GET", () => {
  it("rejects malformed, repeated, and unexpected input before authentication", async () => {
    expect((await GET(request(), params("../studio"))).status).toBe(400);
    expect((await GET(request("?conversationId=../foreign"), params())).status).toBe(400);
    expect((await GET(request("?businessId=foreign"), params())).status).toBe(400);
    expect((await GET(request("?conversationId=a&conversationId=b"), params())).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("denies anonymous, foreign tenant, staff, revoked permission and missing Social access before reads", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), params())).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "foreign" } });
    expect((await GET(request(), params())).status).toBe(403);
    mocks.session.mockResolvedValueOnce({ user: { id: "employee-a", role: "EMPLOYEE", businessSlug: "studio-a" } });
    expect((await GET(request(), params())).status).toBe(403);
    mocks.access.mockResolvedValueOnce({ success: false, reason: "FORBIDDEN", error: "Settings permission required." });
    expect((await GET(request(), params())).status).toBe(403);
    mocks.access.mockResolvedValueOnce({ success: false, reason: "SOCIAL_REQUIRED", error: "Social required." });
    expect((await GET(request("?conversationId=conversation-a"), params())).status).toBe(403);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("passes only the verified business identity and keeps responses private", async () => {
    const response = await GET(request(), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ aiEntitled: false, settings: { mode: "OFF" } });
    expect(mocks.snapshot).toHaveBeenCalledWith("verified-business");
    const detail = await GET(request("?conversationId=conversation-a"), params());
    expect(detail.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.access).toHaveBeenCalledTimes(2);
    expect(mocks.detail).toHaveBeenCalledWith("verified-business", "conversation-a");
  });

  it("returns safe unavailable and missing-conversation errors", async () => {
    mocks.detail.mockResolvedValueOnce(null);
    expect((await GET(request("?conversationId=foreign-conversation"), params())).status).toBe(404);
    mocks.snapshot.mockRejectedValueOnce(new Error("SQL provider token customer secret"));
    const response = await GET(request(), params());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toMatch(/SQL|token|secret/);
  });
});
