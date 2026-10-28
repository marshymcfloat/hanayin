import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn(), business: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.context }));
vi.mock("@/features/businesses/queries/owner-preview", () => ({ getVerifiedOwnerPreviewBusinessName: mocks.business }));
vi.mock("@/components/landing/hanaylo/fonts", () => ({ redesignBodyFont: { variable: "font" } }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewQueryProvider", () => ({ OwnerPreviewQueryProvider: () => null }));
vi.mock("@/components/dashboard/owner-preview/OwnerBookingController", () => ({ OwnerBookingControllerProvider: () => null }));
vi.mock("@/components/dashboard/design-study/OwnerRedesignQuery", () => ({ default: () => null }));
import Page from "@/app/redesign/owner-dashboard/page";
import Layout from "@/app/redesign/owner-dashboard/layout";
import ServicesPage from "@/app/redesign/owner-dashboard/business/services/page";
import ServicesRedirectPage from "@/app/redesign/owner-dashboard/services/page";
import HoursPage from "@/app/redesign/owner-dashboard/business/business-hours/page";
import BillingPage from "@/app/redesign/owner-dashboard/business/billing/page";
import ReportsPage from "@/app/redesign/owner-dashboard/business/reports/page";

async function resolvePage() {
  const page = Layout({ children: Page() });
  expect(page.props.fallback).toBeTruthy();
  const child = page.props.children as ReactElement;
  return (child.type as (props: unknown) => Promise<ReactElement>)(child.props);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "u1", name: "Owner", role: "OWNER", businessSlug: "studio" } });
  mocks.context.mockResolvedValue({ success: true, actorType: "OWNER", userId: "u1", businessId: "b1", businessSlug: "studio" });
  mocks.business.mockResolvedValue({ name: "Verified Studio" });
});
describe("live redesign route", () => {
  it.each([["business-hours", HoursPage], ["billing", BillingPage], ["reports", ReportsPage]] as const)("keeps %s behind the existing verified layout", (name, Component) => {
    const page = Component();
    const layout = Layout({ children: page });
    expect(layout.props.fallback).toBeTruthy();
    expect(layout.props.children.props.children).toBe(page);
    expect(page.props).toMatchObject({ page: name, fontClassName: "font" });
  });
  it("redirects old services links to the business route", () => {
    expect(() => ServicesRedirectPage()).toThrow("redirect:/redesign/owner-dashboard/business/services");
  });
  it("places services behind the same authenticated workspace boundary", () => {
    const services = ServicesPage();
    const layout = Layout({ children: services });
    expect(layout.props.fallback).toBeTruthy();
    expect(layout.props.children.props.children).toBe(services);
    expect(services.props.fontClassName).toBe("font");
  });
  it("protects the request-time read inside a visible suspense shell", async () => {
    const tree = await resolvePage();
    expect(tree.props).toMatchObject({ identity: { userId: "u1", businessId: "b1", businessName: "Verified Studio" } });
  });
  it("redirects anonymous visitors without reading tenant data", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(resolvePage()).rejects.toThrow("redirect:/");
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("honors forced password changes before database access", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u1", role: "OWNER", businessSlug: "studio", mustChangePassword: true } });
    await expect(resolvePage()).rejects.toThrow("redirect:/app/studio/change-password");
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("rejects revoked owner membership", async () => {
    mocks.context.mockResolvedValue({ success: false });
    await expect(resolvePage()).rejects.toThrow("redirect:/");
    expect(mocks.business).not.toHaveBeenCalled();
  });
});
