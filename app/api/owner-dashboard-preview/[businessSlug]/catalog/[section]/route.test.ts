import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  catalog: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/catalog/queries/owner-catalog-preview", () => ({
  resolveOwnerCatalogPreviewReadModel: mocks.catalog,
}));

import { GET } from "./route";

const request = new Request("http://localhost/api/owner-dashboard-preview/beautyfeel/catalog/services");
const params = (businessSlug: string, section: string) => ({
  params: Promise.resolve({ businessSlug, section }),
});

describe("owner preview catalog endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "owner-1", role: "OWNER", businessSlug: "beautyfeel" },
    });
    mocks.catalog.mockResolvedValue({ section: "services", services: [] });
  });

  it("rejects invalid sections before accessing catalog data", async () => {
    const response = await GET(request, params("beautyfeel", "../packages"));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and non-owner requests", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request, params("beautyfeel", "services"))).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "staff-1", role: "EMPLOYEE", businessSlug: "beautyfeel" } });
    expect((await GET(request, params("beautyfeel", "services"))).status).toBe(403);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("denies another tenant without calling the query", async () => {
    const response = await GET(request, params("other-studio", "services"));
    expect(response.status).toBe(403);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("fails closed when membership is missing and serves private owner data otherwise", async () => {
    mocks.catalog.mockResolvedValueOnce(null);
    const denied = await GET(request, params("beautyfeel", "services"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Cache-Control")).toBe("private, no-store");

    const response = await GET(request, params("beautyfeel", "services"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ section: "services", services: [] });
    expect(mocks.catalog).toHaveBeenCalledWith("services", "beautyfeel", "owner-1");
  });
});
