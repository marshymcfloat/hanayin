import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerPreviewIdentity } from "@/components/dashboard/owner-preview/owner-preview-query";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  owner: vi.fn(),
  business: vi.fn(),
  redirect: vi.fn((to: string): never => { throw new Error(`redirect:${to}`); }),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.owner }));
vi.mock("@/features/businesses/queries/owner-preview", () => ({ getVerifiedOwnerPreviewBusinessName: mocks.business }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewLayoutShell", () => ({ OwnerPreviewLayoutShell: () => null }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({ OwnerPreviewQueryProvider: () => null }));

import OwnerDashboardPreviewLayout from "./layout";

const children = <div>Private preview data</div>;
const params = Promise.resolve({ businessSlug: "studio-a" });

async function resolveLayout(routeParams = params) {
  const layout = OwnerDashboardPreviewLayout({ children, params: routeParams });
  const runtime = layout.props.children as ReactElement<{
    children: ReactNode;
    params: Promise<{ businessSlug: string }>;
  }>;
  const renderRuntime = runtime.type as (props: typeof runtime.props) => Promise<ReactElement>;
  return renderRuntime(runtime.props);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner-a", name: "Avery", role: "OWNER", businessSlug: "studio-a" } });
  mocks.owner.mockResolvedValue({ success: true, actorType: "OWNER", ownerId: 7, userId: "owner-a", businessId: "business-a", businessSlug: "studio-a" });
  mocks.business.mockResolvedValue({ name: "Studio A" });
});

describe("owner preview shared layout access", () => {
  it("renders safe, layout-stable rail and content geometry without private children", () => {
    const layout = OwnerDashboardPreviewLayout({ children, params });
    const markup = renderToStaticMarkup(layout.props.fallback);
    expect(markup).toContain("Loading owner workspace");
    expect(markup).toContain("md:block");
    expect(markup).toContain("md:hidden");
    expect(markup).not.toContain("Private preview data");
  });

  it("shares only a verified persisted owner/business identity", async () => {
    const result = await resolveLayout();
    expect((result.props as { identity: OwnerPreviewIdentity }).identity).toEqual({
      userId: "owner-a",
      businessId: "business-a",
      businessSlug: "studio-a",
      businessName: "Studio A",
      ownerName: "Avery",
    });
    expect(result.key).toBe("owner-a:business-a:studio-a");
    expect(mocks.owner).toHaveBeenCalledWith("studio-a", "owner-a");
    expect(mocks.business).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, businessId: "business-a", userId: "owner-a", businessSlug: "studio-a" }));
  });

  it("remounts the private cache when the same business ID uses a different slug", async () => {
    const first = await resolveLayout();
    mocks.session.mockResolvedValue({ user: { id: "owner-a", name: "Avery", role: "OWNER", businessSlug: "studio-b" } });
    mocks.owner.mockResolvedValue({ success: true, actorType: "OWNER", ownerId: 7, userId: "owner-a", businessId: "business-a", businessSlug: "studio-b" });
    const second = await resolveLayout(Promise.resolve({ businessSlug: "studio-b" }));
    expect(first.key).not.toBe(second.key);
    expect(second.key).toBe("owner-a:business-a:studio-b");
  });

  it("denies an unauthenticated request before database work", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(resolveLayout()).rejects.toThrow("redirect:/");
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.business).not.toHaveBeenCalled();
  });

  it("redirects a mismatched tenant before database work", async () => {
    mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "studio-b" } });
    await expect(resolveLayout()).rejects.toThrow("redirect:/owner-dashboard-preview/studio-b");
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.business).not.toHaveBeenCalled();
  });

  it("denies a stale owner membership before exposing business data", async () => {
    mocks.owner.mockResolvedValue({ success: false, error: "Forbidden" });
    await expect(resolveLayout()).rejects.toThrow("redirect:/");
    expect(mocks.business).not.toHaveBeenCalled();
  });

  it("denies a missing business after membership verification", async () => {
    mocks.business.mockResolvedValue(null);
    await expect(resolveLayout()).rejects.toThrow("redirect:/");
  });
});
