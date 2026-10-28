import { Suspense, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/app/(private-preview)/owner-dashboard-preview/[businessSlug]/services/page", () => ({ default: () => null }));
vi.mock("@/app/(private-preview)/owner-dashboard-preview/[businessSlug]/packages/page", () => ({ default: () => null }));

vi.mock("@/app/(private)/app/[businessSlug]/services/ServicesContent", () => ({
  ServicesContent: () => null,
}));
vi.mock("@/app/(private)/app/[businessSlug]/services/ServicesPageSkeleton", () => ({
  ServicesPageSkeleton: () => null,
}));
vi.mock("@/app/(private)/app/[businessSlug]/packages/PackagesContent", () => ({
  PackagesContent: () => null,
}));
vi.mock("@/app/(private)/app/[businessSlug]/packages/PackagesPageSkeleton", () => ({
  PackagesPageSkeleton: () => null,
}));

import PackagesPage from "@/app/(private)/app/[businessSlug]/packages/page";
import ServicesPage from "@/app/(private)/app/[businessSlug]/services/page";
import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";

type BoundaryElement = ReactElement<{
  children: ReactElement<{ params: Promise<{ businessSlug: string }> }>;
  fallback: ReactElement<{ section: string }>;
}>;

describe("instant route boundaries", () => {
  it.each([
    ["services", ServicesPage],
    ["packages", PackagesPage],
  ])("keeps %s params consumption beneath Suspense", (_route, Page) => {
    const params = Promise.resolve({ businessSlug: "beautyfeel" });
    const element = Page({ params }) as BoundaryElement;

    expect(element.type).toBe(Suspense);
    expect(element.props.children.props.params).toBe(params);
    expect(element.props.fallback.type).toBe(OwnerRouteLoading);
    expect(element.props.fallback.props.section).toBe(_route);
  });
});
