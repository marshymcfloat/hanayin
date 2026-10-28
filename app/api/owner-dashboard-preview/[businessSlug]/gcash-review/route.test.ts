import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  actor: vi.fn(),
  queue: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/features/payments/queries/manual-gcash", () => ({
  getOwnerGcashReviewQueue: mocks.queue,
}));

import { GET } from "./route";

function request(businessSlug: string) {
  return GET(new Request(`http://localhost/api/owner-dashboard-preview/${businessSlug}/gcash-review`), {
    params: Promise.resolve({ businessSlug }),
  });
}

describe("owner GCash review queue GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.actor.mockResolvedValue({
      success: true,
      actorType: "OWNER",
      businessId: "verified-business",
    });
    mocks.queue.mockResolvedValue({ verificationItems: [], followUpItems: [] });
  });

  it("rejects invalid, anonymous, employee, and cross-tenant requests before reading payments", async () => {
    expect((await request("")).status).toBe(400);
    mocks.session.mockResolvedValueOnce(null);
    expect((await request("salon")).status).toBe(401);
    mocks.actor.mockResolvedValueOnce({ success: true, actorType: "EMPLOYEE" });
    expect((await request("salon")).status).toBe(403);
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Unauthorized" });
    expect((await request("other-salon")).status).toBe(403);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("reads only the verified tenant and returns private, no-store JSON", async () => {
    const response = await request("salon");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.actor).toHaveBeenCalledWith("salon", "owner-1");
    expect(mocks.queue).toHaveBeenCalledWith({ businessId: "verified-business" });
    expect(await response.json()).toEqual({ verificationItems: [], followUpItems: [] });
  });

  it("returns a safe configuration error", async () => {
    mocks.queue.mockRejectedValueOnce(new Error("GCASH_NOT_CONFIGURED"));
    const response = await request("salon");
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "GCash account is not configured." });
  });

  it("does not expose unexpected persistence errors", async () => {
    mocks.queue.mockRejectedValueOnce(new Error("private database detail"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await request("salon");
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ error: "Unable to load GCash review queue." });
    } finally {
      consoleError.mockRestore();
    }
  });
});
