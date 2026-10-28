import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerPreviewKeys, type OwnerPreviewIdentity } from "./owner-preview-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
const identity: OwnerPreviewIdentity = {
  userId: "owner-1",
  businessId: "business-1",
  businessSlug: "beautyfeel",
  businessName: "BeautyFeel",
  ownerName: "Owner",
};

vi.mock("./OwnerPreviewQueryProvider", () => ({
  useOwnerPreviewContext: () => identity,
  useOwnerPreviewFetch: () => mocks.fetch,
}));
vi.mock("./OwnerServicesPreview", () => ({
  OwnerServicesPreview: ({ data, refreshControl, onChanged }: { data: { services: Array<{ id: number; name: string }> }; refreshControl: ReactNode; onChanged: (change: { type: "upsert"; item: { id: number; name: string } } | { type: "delete"; id: number }) => void }) => (
    <main><h1>Services</h1><p>{data.services[0]?.name}</p>{refreshControl}<button type="button" onClick={() => onChanged({ type: "upsert", item: { id: 1, name: "Saved Cut" } })}>Simulate save</button><button type="button" onClick={() => onChanged({ type: "delete", id: 1 })}>Simulate delete</button></main>
  ),
}));
vi.mock("./OwnerPackagesPreview", () => ({ OwnerPackagesPreview: () => <main>Packages</main> }));
vi.mock("@/components/dashboard/design-study/OwnerPackagesStudy", () => ({ OwnerPackagesStudy: ({ data, onChanged }: { data: { packages: Array<{ name: string }> }; onChanged: (change: { type: "upsert"; item: { id: number; name: string } }) => void }) => <section aria-label="Redesign packages">{data.packages[0]?.name}<button onClick={() => onChanged({ type: "upsert", item: { id: 1, name: "Saved package" } })}>Save package</button></section> }));
vi.mock("@/components/dashboard/design-study/OwnerServicesStudy", () => ({ OwnerServicesStudy: ({ data }: { data: { services: Array<{ name: string }> } }) => <section aria-label="Redesign catalog">{data.services[0]?.name}</section> }));
vi.mock("./OwnerVouchersPreview", () => ({ OwnerVouchersPreview: () => <main>Vouchers</main> }));
vi.mock("@/components/dashboard/design-study/OwnerVouchersStudy", () => ({ OwnerVouchersStudy: ({ data, onChanged }: { data: { vouchers: Array<{ id: number; code: string }> }; onChanged: (change: { type: "upsert"; item: { id: number; code: string } }) => void }) => <section aria-label="Redesign vouchers">{data.vouchers[0]?.code}<button type="button" onClick={() => onChanged({ type: "upsert", item: { id: 1, code: "SAVED20" } })}>Save voucher</button></section> }));
vi.mock("./OwnerGiftCardsPreview", () => ({ OwnerGiftCardsPreview: ({ onGiftCardClaimed }: { onGiftCardClaimed: () => void }) => <main>Gift cards<button type="button" onClick={onGiftCardClaimed}>Simulate claim</button></main> }));
vi.mock("@/components/dashboard/design-study/OwnerGiftCardsStudy", () => ({ OwnerGiftCardsStudy: ({ data, onChanged, onGiftCardClaimed }: { data: { giftCards: Array<{ id: number; code: string }> }; onChanged: (change: { type: "upsert"; item: { id: number; code: string } }) => void; onGiftCardClaimed: () => void }) => <section aria-label="Redesign gifts">{data.giftCards[0]?.code}<button type="button" onClick={() => onChanged({ type: "upsert", item: { id: 1, code: "SAVEDGIFT" } })}>Save gift</button><button type="button" onClick={onGiftCardClaimed}>Confirm gift claim</button></section> }));

import { invalidateCatalogAfterMutation, OwnerCatalogPreviewQuery } from "./OwnerCatalogPreviewQuery";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 15 * 60 * 1000 } } });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function view(queryClient: QueryClient) {
  return render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="services" /></QueryClientProvider>);
}

describe("catalog preview query cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads gift cards with matching geometry and reuses fresh owner-scoped data", async () => {
    mocks.fetch.mockResolvedValue({ section: "gift-cards", giftCards: [{ id: 1, code: "LIVEGIFT" }] });
    const queryClient = client();
    const view = render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="gift-cards" giftCardsDesign /></QueryClientProvider>);
    expect(screen.getByLabelText("Loading gift cards")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Redesign gifts" })).toHaveTextContent("LIVEGIFT");
    expect(mocks.fetch).toHaveBeenCalledWith("/api/owner-dashboard-preview/beautyfeel/catalog/gift-cards", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    view.unmount();
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="gift-cards" giftCardsDesign /></QueryClientProvider>);
    expect(screen.queryByLabelText("Loading gift cards")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a cold gift-card failure locally", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ section: "gift-cards", giftCards: [{ id: 1, code: "LIVEGIFT" }] });
    render(<QueryClientProvider client={client()}><OwnerCatalogPreviewQuery section="gift-cards" giftCardsDesign /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your gift cards are still saved");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Redesign gifts" })).toHaveTextContent("LIVEGIFT");
  });

  it("keeps committed gift cards mounted when refresh fails", async () => {
    const queryClient = client(); const key = ownerPreviewKeys.section(identity, "gift-cards", "catalog");
    queryClient.setQueryData(key, { section: "gift-cards", giftCards: [{ id: 1, code: "LIVEGIFT" }] });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="gift-cards" giftCardsDesign /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Save gift" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Redesign gifts" })).toHaveTextContent("SAVEDGIFT"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Showing your last loaded catalog");
    expect(screen.queryByLabelText("Loading gift cards")).not.toBeInTheDocument();
    expect(queryClient.getQueryData<{ giftCards: Array<{ code: string }> }>(key)?.giftCards[0].code).toBe("SAVEDGIFT");
  });

  it("invalidates gift-card mutation dependents without touching unrelated catalogs or tenants", () => {
    const queryClient = client();
    const affected = [ownerPreviewKeys.section(identity, "gift-cards", "catalog"), ownerPreviewKeys.section(identity, "bookings", "create-catalog"), ownerPreviewKeys.section(identity, "dashboard", "redesign"), ownerPreviewKeys.section(identity, "dashboard", "performance"), ownerPreviewKeys.section(identity, "reports", "summary")];
    const unaffected = [ownerPreviewKeys.section({ ...identity, businessId: "other" }, "gift-cards", "catalog"), ownerPreviewKeys.section(identity, "services", "catalog"), ownerPreviewKeys.section(identity, "packages", "catalog"), ownerPreviewKeys.section(identity, "vouchers", "catalog")];
    for (const key of [...affected, ...unaffected]) queryClient.setQueryData(key, {});
    invalidateCatalogAfterMutation(queryClient, identity, "gift-cards");
    for (const key of affected) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unaffected) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it("invalidates redesigned analytics, bookings and customers only after claim confirmation", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "gift-cards", "catalog"), { section: "gift-cards", giftCards: [] });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="gift-cards" giftCardsDesign /></QueryClientProvider>);
    const confirm = await screen.findByRole("button", { name: "Confirm gift claim" });
    expect(invalidate).not.toHaveBeenCalled(); fireEvent.click(confirm);
    for (const section of ["today", "queue", "performance", "redesign", "growth"]) expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", section) });
    for (const page of ["gift-cards", "bookings", "customers", "reports"]) expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.page(identity, page) });
  });

  it("loads vouchers with a matching skeleton and reuses fresh owner-scoped data", async () => {
    mocks.fetch.mockResolvedValue({ section: "vouchers", vouchers: [{ id: 1, code: "LIVE20" }] });
    const queryClient = client();
    const view = render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="vouchers" vouchersDesign /></QueryClientProvider>);
    expect(screen.getByLabelText("Loading vouchers")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Redesign vouchers" })).toHaveTextContent("LIVE20");
    expect(mocks.fetch).toHaveBeenCalledWith("/api/owner-dashboard-preview/beautyfeel/catalog/vouchers", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    view.unmount();
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="vouchers" vouchersDesign /></QueryClientProvider>);
    expect(screen.queryByLabelText("Loading vouchers")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a cold vouchers error locally", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ section: "vouchers", vouchers: [{ id: 1, code: "LIVE20" }] });
    render(<QueryClientProvider client={client()}><OwnerCatalogPreviewQuery section="vouchers" vouchersDesign /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your vouchers are still saved");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Redesign vouchers" })).toHaveTextContent("LIVE20");
  });

  it("keeps a confirmed voucher and its mounted presentation when background refresh fails", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "vouchers", "catalog");
    queryClient.setQueryData(key, { section: "vouchers", vouchers: [{ id: 1, code: "LIVE20" }] });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="vouchers" vouchersDesign /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Save voucher" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Redesign vouchers" })).toHaveTextContent("SAVED20"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Showing your last loaded catalog");
    expect(screen.queryByLabelText("Loading vouchers")).not.toBeInTheDocument();
    expect(queryClient.getQueryData<{ vouchers: Array<{ code: string }> }>(key)?.vouchers[0].code).toBe("SAVED20");
  });

  it("invalidates voucher dependents without invalidating other tenants or unrelated catalogs", () => {
    const queryClient = client();
    const other = { ...identity, businessId: "other", businessSlug: "other" };
    const affected = [ownerPreviewKeys.section(identity, "vouchers", "catalog"), ownerPreviewKeys.section(identity, "bookings", "create-catalog"), ownerPreviewKeys.section(identity, "dashboard", "redesign"), ownerPreviewKeys.section(identity, "dashboard", "performance"), ownerPreviewKeys.section(identity, "reports", "summary")];
    const unaffected = [ownerPreviewKeys.section(other, "vouchers", "catalog"), ownerPreviewKeys.section(identity, "services", "catalog"), ownerPreviewKeys.section(identity, "packages", "catalog")];
    for (const key of [...affected, ...unaffected]) queryClient.setQueryData(key, {});
    invalidateCatalogAfterMutation(queryClient, identity, "vouchers");
    for (const key of affected) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unaffected) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it("loads redesigned packages independently through the existing authenticated catalog endpoint", async () => {
    mocks.fetch.mockResolvedValue({ section: "packages", packages: [{ name: "Live bundle" }] });
    render(<QueryClientProvider client={client()}><OwnerCatalogPreviewQuery section="packages" packagesDesign /></QueryClientProvider>);
    expect(screen.getByLabelText("Loading packages")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Redesign packages" })).toHaveTextContent("Live bundle");
    expect(mocks.fetch).toHaveBeenCalledWith("/api/owner-dashboard-preview/beautyfeel/catalog/packages", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a cold package failure without replacing the shell", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ section: "packages", packages: [{ name: "Recovered bundle" }] });
    render(<QueryClientProvider client={client()}><OwnerCatalogPreviewQuery section="packages" packagesDesign /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your packages are still saved");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Redesign packages" })).toHaveTextContent("Recovered bundle");
  });

  it("retains committed packages through failed refreshes and invalidates related catalogs only after commit", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "packages", "catalog");
    queryClient.setQueryData(key, { section: "packages", packages: [{ id: 1, name: "Cached bundle" }] });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="packages" packagesDesign /></QueryClientProvider>);
    expect(await screen.findByRole("region", { name: "Redesign packages" })).toHaveTextContent("Cached bundle");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save package" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Redesign packages" })).toHaveTextContent("Saved package"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Showing your last loaded catalog");
    expect(screen.queryByLabelText("Loading packages")).not.toBeInTheDocument();
    for (const page of ["packages", "gift-cards", "sale-events", "reports"]) expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.page(identity, page) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "bookings", "create-catalog"), exact: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
  });

  it("uses the redesign skeleton and presentation only when requested", async () => {
    mocks.fetch.mockResolvedValue({ section: "services", services: [{ name: "Live redesigned cut" }] });
    const queryClient = client();
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="services" servicesDesign /></QueryClientProvider>);
    expect(screen.getByLabelText("Loading services")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Redesign catalog" })).toHaveTextContent("Live redesigned cut");
    expect(screen.queryByLabelText("Loading services")).not.toBeInTheDocument();
  });

  it("offers local retry when a redesign catalog request fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(<QueryClientProvider client={client()}><OwnerCatalogPreviewQuery section="services" servicesDesign /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your services are still saved");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("shows a skeleton only on cold load and reuses a fresh warm result", async () => {
    mocks.fetch.mockResolvedValue({ section: "services", services: [{ name: "Live Cut" }] });
    const queryClient = client();
    const first = view(queryClient);
    expect(screen.getByLabelText("Loading services preview")).toBeInTheDocument();
    expect(await screen.findByText("Live Cut")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    first.unmount();
    view(queryClient);
    expect(screen.queryByLabelText("Loading services preview")).not.toBeInTheDocument();
    expect(screen.getByText("Live Cut")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps cached content visible during a targeted manual refresh and on failure", async () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "services", "catalog"), {
      section: "services", services: [{ name: "Live Cut" }],
    });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    view(queryClient);

    fireEvent.click(screen.getByRole("button", { name: "Refresh services catalog" }));
    expect(screen.getByText("Live Cut")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Refresh failed; catalog totals and selector options may be outdated.")).toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Loading services preview")).not.toBeInTheDocument();
  });

  it("invalidates service selectors and dependent previews, not unrelated voucher cache", () => {
    const queryClient = client();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    for (const page of ["services", "packages", "gift-cards", "vouchers", "sale-events", "reports"]) {
      queryClient.setQueryData(ownerPreviewKeys.section(identity, page, "catalog"), { page });
    }
    for (const section of ["performance", "growth", "queue", "today-bookings"]) {
      queryClient.setQueryData(ownerPreviewKeys.section(identity, "dashboard", section), { section });
    }
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "bookings", "create-catalog"), { services: [] });

    invalidateCatalogAfterMutation(queryClient, identity, "services");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "bookings", "create-catalog"), exact: true });
    for (const page of ["services", "packages", "gift-cards", "sale-events", "reports"]) {
      expect(queryClient.getQueryState(ownerPreviewKeys.section(identity, page, "catalog"))?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(ownerPreviewKeys.section(identity, "vouchers", "catalog"))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(ownerPreviewKeys.section(identity, "bookings", "create-catalog"))?.isInvalidated).toBe(true);
    for (const section of ["performance", "growth"]) {
      expect(queryClient.getQueryState(ownerPreviewKeys.section(identity, "dashboard", section))?.isInvalidated).toBe(true);
    }
    for (const section of ["queue", "today-bookings"]) {
      expect(queryClient.getQueryState(ownerPreviewKeys.section(identity, "dashboard", section))?.isInvalidated).toBe(false);
    }
  });

  it("invalidates bookings and gift-card dependents after a confirmed claim", () => {
    const queryClient = client();
    queryClient.setQueryData(ownerPreviewKeys.section(identity, "gift-cards", "catalog"), { section: "gift-cards" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    render(<QueryClientProvider client={queryClient}><OwnerCatalogPreviewQuery section="gift-cards" /></QueryClientProvider>);
    expect(invalidate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Simulate claim" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.page(identity, "gift-cards") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.page(identity, "bookings") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "today") });
  });

  it("targets the exact owner booking catalog after a package mutation", () => {
    const queryClient = client();
    const catalogKey = ownerPreviewKeys.section(identity, "bookings", "create-catalog");
    const filteredCatalogKey = ownerPreviewKeys.section(identity, "bookings", "create-catalog", { mode: "other" });
    const bookingListKey = ownerPreviewKeys.section(identity, "bookings", "list");
    const otherTenantKey = ownerPreviewKeys.section({ ...identity, businessId: "business-2", businessSlug: "other-business" }, "bookings", "create-catalog");
    for (const key of [catalogKey, filteredCatalogKey, bookingListKey, otherTenantKey]) {
      queryClient.setQueryData(key, { services: [], packages: [], categories: [] });
    }
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    invalidateCatalogAfterMutation(queryClient, identity, "packages");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: catalogKey, exact: true });
    expect(queryClient.getQueryState(catalogKey)?.isInvalidated).toBe(true);
    for (const key of [filteredCatalogKey, bookingListKey, otherTenantKey]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    }
  });

  it("commits a successful edit to memory before its background refetch completes", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "services", "catalog");
    queryClient.setQueryData(key, { section: "services", services: [{ id: 1, name: "Live Cut" }] });
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    view(queryClient);

    fireEvent.click(screen.getByRole("button", { name: "Simulate save" }));
    await waitFor(() => expect(screen.getByText("Saved Cut")).toBeInTheDocument());
    expect(queryClient.getQueryData<{ services: Array<{ name: string }> }>(key)?.services[0].name).toBe("Saved Cut");
    expect(screen.queryByLabelText("Loading services preview")).not.toBeInTheDocument();
  });

  it("keeps a committed row and warns that totals and selector options may be stale if refetch fails", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "services", "catalog");
    queryClient.setQueryData(key, { section: "services", services: [{ id: 1, name: "Live Cut" }] });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    view(queryClient);

    fireEvent.click(screen.getByRole("button", { name: "Simulate save" }));
    await waitFor(() => expect(screen.getByText("Saved Cut")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Refresh failed; catalog totals and selector options may be outdated.")).toBeInTheDocument());
    expect(queryClient.getQueryData<{ services: Array<{ name: string }> }>(key)?.services[0].name).toBe("Saved Cut");
  });

  it("does not apply an older pending cache commit after a newer delete", async () => {
    const queryClient = client();
    const key = ownerPreviewKeys.section(identity, "services", "catalog");
    queryClient.setQueryData(key, { section: "services", services: [{ id: 1, name: "Live Cut" }] });
    const first = deferred();
    const second = deferred();
    vi.spyOn(queryClient, "cancelQueries")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    view(queryClient);

    fireEvent.click(screen.getByRole("button", { name: "Simulate save" }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate delete" }));
    second.resolve();
    await waitFor(() => expect(queryClient.getQueryData<{ services: unknown[] }>(key)?.services).toEqual([]));
    await act(async () => {
      first.resolve();
      await first.promise;
    });
    expect(queryClient.getQueryData<{ services: unknown[] }>(key)?.services).toEqual([]);
  });
});
