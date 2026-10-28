import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), actor: vi.fn(), list: vi.fn(), count: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: { outboxMessage: { findMany: mocks.list, count: mocks.count } } }));

import { GET } from "./route";

const params = (businessSlug = "studio-luna") => ({ params: Promise.resolve({ businessSlug }) });
const request = (query = "") => new Request("http://localhost/api/owner-dashboard-preview/studio-luna/notifications" + query);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "studio-luna" } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", userId: "owner-a", businessId: "verified-business" });
  mocks.list.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});

describe("notifications preview GET", () => {
  it("rejects invalid filters, anonymous actors, foreign tenants, and revoked membership before reading", async () => {
    expect((await GET(request(), params("../other"))).status).toBe(400);
    expect((await GET(request("?page=0"), params())).status).toBe(400);
    expect((await GET(request("?type=INTERNAL_ADMIN_EVENT"), params())).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();

    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), params())).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "other" } });
    expect((await GET(request(), params())).status).toBe(403);
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect((await GET(request(), params())).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("scopes history to verified tenant and returns a redacted JSON-safe DTO", async () => {
    mocks.list.mockResolvedValue([{
      id: "event-1",
      event_type: "BOOKING_CONFIRMED",
      payload: { customerName: "Bianca Cruz", secret: "private payload" },
      processed_at: new Date("2026-09-16T02:12:00.000Z"),
      created_at: new Date("2026-09-16T02:00:00.000Z"),
      last_error: "private provider key",
    }]);
    mocks.count.mockResolvedValue(51);

    const response = await GET(request("?page=2&type=BOOKING_CONFIRMED"), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.actor).toHaveBeenCalledWith("studio-luna", "owner-a");
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      where: { business_id: "verified-business", processed: true, event_type: "BOOKING_CONFIRMED" },
      skip: 50,
      take: 50,
    }));
    const body = await response.json();
    expect(body).toMatchObject({
      totalCount: 51, page: 2, pageSize: 50, totalPages: 2,
      notifications: [{ id: "event-1", customerName: "Bianca Cruz", sentAt: "2026-09-16T02:12:00.000Z", success: false, failureReason: "Notification delivery failed.", smsSent: null, emailSent: null }],
    });
    expect(JSON.stringify(body)).not.toMatch(/private payload|private provider key/);
  });

  it("returns a safe error when persistence fails", async () => {
    mocks.list.mockRejectedValue(new Error("private database failure"));
    const response = await GET(request(), params());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain("private database failure");
  });
});
