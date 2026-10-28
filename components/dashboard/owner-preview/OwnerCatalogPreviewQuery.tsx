"use client";

import { useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ownerPreviewKeys,
  ownerPreviewStaleTime,
  type OwnerPreviewIdentity,
} from "@/components/dashboard/owner-preview/owner-preview-query";
import {
  useOwnerPreviewContext,
  useOwnerPreviewFetch,
} from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import type {
  OwnerCatalogCommittedChange,
  OwnerCatalogPreviewReadModel,
  OwnerCatalogPreviewSection,
  OwnerGiftCardsPreviewReadModel,
  OwnerPackagesPreviewReadModel,
  OwnerServicesPreviewReadModel,
  OwnerVouchersPreviewReadModel,
} from "@/features/catalog/types/owner-catalog-preview";
import { OwnerCatalogPreviewSkeleton } from "./OwnerCatalogPreviewSkeleton";
import { OwnerGiftCardsPreview } from "./OwnerGiftCardsPreview";
import { OwnerPackagesPreview } from "./OwnerPackagesPreview";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { OwnerServicesPreview } from "./OwnerServicesPreview";
import { OwnerVouchersPreview } from "./OwnerVouchersPreview";
import { OwnerServicesLoading } from "@/components/dashboard/design-study/OwnerServicesLoading";
import { OwnerPackagesLoading } from "@/components/dashboard/design-study/OwnerPackagesLoading";
import { OwnerVouchersLoading } from "@/components/dashboard/design-study/OwnerVouchersLoading";
import { OwnerGiftCardsLoading } from "@/components/dashboard/design-study/OwnerGiftCardsLoading";
import { refreshCatalogWithToast } from "@/components/dashboard/owner-preview/refreshCatalogWithToast";
import dynamic from "next/dynamic";
import servicesStyles from "@/components/dashboard/design-study/owner-services.module.css";

const OwnerServicesStudy = dynamic(() => import("@/components/dashboard/design-study/OwnerServicesStudy").then(module => module.OwnerServicesStudy), { loading: () => <OwnerServicesLoading /> });
const OwnerPackagesStudy = dynamic(() => import("@/components/dashboard/design-study/OwnerPackagesStudy").then(module => module.OwnerPackagesStudy), { loading: () => <OwnerPackagesLoading /> });
const OwnerVouchersStudy = dynamic(() => import("@/components/dashboard/design-study/OwnerVouchersStudy").then(module => module.OwnerVouchersStudy), { loading: () => <OwnerVouchersLoading /> });
const OwnerGiftCardsStudy = dynamic(() => import("@/components/dashboard/design-study/OwnerGiftCardsStudy").then(module => module.OwnerGiftCardsStudy), { loading: () => <OwnerGiftCardsLoading /> });

export function invalidateCatalogAfterMutation(
  client: QueryClient,
  identity: OwnerPreviewIdentity,
  section: OwnerCatalogPreviewSection,
) {
  const affected = new Set<OwnerCatalogPreviewSection>([section]);
  if (section === "services") {
    affected.add("packages");
    affected.add("gift-cards");
  } else if (section === "packages") {
    affected.add("gift-cards");
  }

  for (const page of affected) {
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, page) });
  }
  if (section === "services" || section === "packages") {
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "sale-events") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "bookings", "create-catalog"), exact: true });
  }
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "performance") });
  if (section === "vouchers" || section === "gift-cards") {
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "bookings", "create-catalog"), exact: true });
  }
  if (section === "services" || section === "packages") {
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "growth") });
  }
  void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "reports") });
}

function applyCommittedChange<T extends { id: number }>(
  items: T[],
  change: OwnerCatalogCommittedChange<T>,
) {
  if (change.type === "delete") return items.filter((item) => item.id !== change.id);
  const existing = items.some((item) => item.id === change.item.id);
  return existing
    ? items.map((item) => item.id === change.item.id ? change.item : item)
    : [change.item, ...items];
}

export function OwnerCatalogPreviewQuery({ section, fontClassName = "", servicesDesign = false, packagesDesign = false, vouchersDesign = false, giftCardsDesign = false }: { section: OwnerCatalogPreviewSection; fontClassName?: string; servicesDesign?: boolean; packagesDesign?: boolean; vouchersDesign?: boolean; giftCardsDesign?: boolean }) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const client = useQueryClient();
  const commitSequence = useRef(new Map<number, number>());
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, section, "catalog"),
    queryFn: ({ signal }) => previewFetch<OwnerCatalogPreviewReadModel>(
      `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/catalog/${section}`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.catalog,
  });

  if (!query.data && query.isPending) {
    if (section === "gift-cards" && giftCardsDesign) return <OwnerGiftCardsLoading fontClassName={fontClassName} />;
    if (section === "vouchers" && vouchersDesign) return <OwnerVouchersLoading fontClassName={fontClassName} />;
    if (section === "packages" && packagesDesign) return <OwnerPackagesLoading fontClassName={fontClassName} />;
    if (section === "services" && servicesDesign) return <OwnerServicesLoading label="services" fontClassName={fontClassName} />;
    return <OwnerCatalogPreviewSkeleton label={`${section} preview`} />;
  }

  if (!query.data) {
    if (section === "gift-cards" && giftCardsDesign) return <div className={`${servicesStyles.page} ${fontClassName}`}><div className={servicesStyles.content}><p className={servicesStyles.eyebrow}>Customer gifting</p><h1>Gift cards</h1><div className={servicesStyles.empty}><div><h2>We couldn’t load your catalog.</h2><p role="alert">Your gift cards are still saved. Try refreshing to reconnect.</p><button type="button" disabled={query.isFetching} className={servicesStyles.primary} onClick={() => void refreshCatalogWithToast(client, ownerPreviewKeys.section(identity, section, "catalog"))}>{query.isFetching ? "Retrying…" : "Try again"}</button></div></div></div></div>;
    if (section === "vouchers" && vouchersDesign) return <div className={`${servicesStyles.page} ${fontClassName}`}><div className={servicesStyles.content}><p className={servicesStyles.eyebrow}>Customer incentives</p><h1>Vouchers</h1><div className={servicesStyles.empty}><div><h2>We couldn’t load your catalog.</h2><p role="alert">Your vouchers are still saved. Try refreshing to reconnect.</p><button type="button" disabled={query.isFetching} className={servicesStyles.primary} onClick={() => void refreshCatalogWithToast(client, ownerPreviewKeys.section(identity, section, "catalog"))}>{query.isFetching ? "Retrying…" : "Try again"}</button></div></div></div></div>;
    if (section === "packages" && packagesDesign) return <div className={`${servicesStyles.page} ${fontClassName}`}><div className={servicesStyles.content}><p className={servicesStyles.eyebrow}>Your curated offers</p><h1>Packages</h1><div className={servicesStyles.empty}><div><h2>We couldn’t load your catalog.</h2><p role="alert">Your packages are still saved. Try refreshing to reconnect.</p><button type="button" disabled={query.isFetching} className={servicesStyles.primary} onClick={() => void refreshCatalogWithToast(client, ownerPreviewKeys.section(identity, section, "catalog"))}>{query.isFetching ? "Retrying…" : "Try again"}</button></div></div></div></div>;
    if (section === "services" && servicesDesign) return <div className={`${servicesStyles.page} ${fontClassName}`}><div className={servicesStyles.content}><p className={servicesStyles.eyebrow}>Your treatment menu</p><h1>Services</h1><div className={servicesStyles.empty}><div><h2>We couldn’t load your catalog.</h2><p role="alert">Your services are still saved. Try refreshing to reconnect.</p><button type="button" disabled={query.isFetching} className={servicesStyles.primary} onClick={() => void refreshCatalogWithToast(client, ownerPreviewKeys.section(identity, section, "catalog"))}>{query.isFetching ? "Retrying…" : "Try again"}</button></div></div></div></div>;
    return (
      <main className="pb-24 md:pl-[128px]">
        <div className="mx-auto max-w-[1680px] px-4 py-8 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold">Catalog unavailable</h1>
          <p role="alert" className="mt-2 text-sm text-[#C74248]">The catalog could not be loaded. Please retry.</p>
          <div className="mt-4">
            <OwnerPreviewRefreshControl
              label={`${section} catalog`}
              isFetching={query.isFetching}
              updatedAt={query.dataUpdatedAt}
              error="Refresh failed"
              onRefresh={() => { void query.refetch(); }}
            />
          </div>
        </div>
      </main>
    );
  }

  const refreshControl = (
    <OwnerPreviewRefreshControl
      label={`${section} catalog`}
      isFetching={query.isFetching}
      updatedAt={query.dataUpdatedAt}
      error={query.isError ? "Refresh failed; catalog totals and selector options may be outdated." : null}
      onRefresh={() => { void query.refetch(); }}
    />
  );
  async function commit<T extends OwnerCatalogPreviewReadModel>(
    page: OwnerCatalogPreviewSection,
    change: OwnerCatalogCommittedChange<{ id: number }>,
    update: (current: T | undefined) => T | undefined,
  ) {
    const key = ownerPreviewKeys.section(identity, page, "catalog");
    const targetId = change.type === "delete" ? change.id : change.item.id;
    const sequence = (commitSequence.current.get(targetId) ?? 0) + 1;
    commitSequence.current.set(targetId, sequence);
    await client.cancelQueries({ queryKey: key, exact: true });
    if (commitSequence.current.get(targetId) !== sequence) return;
    client.setQueryData<T>(key, update);
    invalidateCatalogAfterMutation(client, identity, page);
  }
  const data = query.data;

  if (data.section === "services") {
    const Services = servicesDesign ? OwnerServicesStudy : OwnerServicesPreview;
    return <>{servicesDesign && query.isError && <p role="alert" className={servicesStyles.notice}>Refresh failed. Showing your last loaded catalog; try Refresh data again.</p>}<Services data={data} {...(servicesDesign ? { fontClassName } : {})} refreshControl={servicesDesign ? undefined : refreshControl} onChanged={(change) => {
      void commit<OwnerServicesPreviewReadModel>("services", change, (current) => current && {
        ...current, services: applyCommittedChange(current.services, change),
      });
    }} /></>;
  }
  if (data.section === "packages") {
    const Packages = packagesDesign ? OwnerPackagesStudy : OwnerPackagesPreview;
    return <>{packagesDesign && query.isError && <p role="alert" className={servicesStyles.notice}>Refresh failed. Showing your last loaded catalog; try Refresh data again.</p>}<Packages data={data} {...(packagesDesign ? { fontClassName } : {})} refreshControl={packagesDesign ? undefined : refreshControl} onChanged={(change) => {
      void commit<OwnerPackagesPreviewReadModel>("packages", change, (current) => current && {
        ...current, packages: applyCommittedChange(current.packages, change),
      });
    }} /></>;
  }
  if (data.section === "vouchers") {
    const Vouchers = vouchersDesign ? OwnerVouchersStudy : OwnerVouchersPreview;
    return <>{vouchersDesign && query.isError && <p role="alert" className={servicesStyles.notice}>Refresh failed. Showing your last loaded catalog; try Refresh data again.</p>}<Vouchers data={data} {...(vouchersDesign ? { fontClassName } : {})} refreshControl={vouchersDesign ? undefined : refreshControl} onChanged={(change) => {
      void commit<OwnerVouchersPreviewReadModel>("vouchers", change, (current) => current && {
        ...current, vouchers: applyCommittedChange(current.vouchers, change),
      });
    }} /></>;
  }
  const GiftCards = giftCardsDesign ? OwnerGiftCardsStudy : OwnerGiftCardsPreview;
  return <>{giftCardsDesign && query.isError && <p role="alert" className={servicesStyles.notice}>Refresh failed. Showing your last loaded catalog; try Refresh data again.</p>}<GiftCards data={data} {...(giftCardsDesign ? { fontClassName } : {})} refreshControl={giftCardsDesign ? undefined : refreshControl} onGiftCardClaimed={() => {
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "gift-cards") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "bookings") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "today") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "queue") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "performance") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "redesign") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.section(identity, "dashboard", "growth") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "customers") });
    void client.invalidateQueries({ queryKey: ownerPreviewKeys.page(identity, "reports") });
  }} onChanged={(change) => {
    void commit<OwnerGiftCardsPreviewReadModel>("gift-cards", change, (current) => current && {
      ...current, giftCards: applyCommittedChange(current.giftCards, change),
    });
  }} /></>;
}
