"use client";

import { useCallback } from "react";
import { signOut } from "next-auth/react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import { OwnerCatalogPreviewQuery } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewQuery";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { useOwnerBookingController } from "@/components/dashboard/owner-preview/OwnerBookingController";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { refreshCatalogWithToast } from "@/components/dashboard/owner-preview/refreshCatalogWithToast";

export default function OwnerPackagesRedesign({ fontClassName = "" }: { fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const client = useQueryClient();
  const { openBooking } = useOwnerBookingController();
  const key = ownerPreviewKeys.section(identity, "packages", "catalog");
  const fetching = useIsFetching({ queryKey: key, exact: true }) > 0;
  const onBooking = useCallback((focusKey = "redesign-new-booking") => openBooking(focusKey), [openBooking]);
  const onSignOut = useCallback(async () => { await signOut({ callbackUrl: "/" }); }, []);

  return <OwnerDashboardShell activePage="packages" fontClassName={fontClassName}
    business={{ name: identity.businessName, slug: identity.businessSlug }} ownerName={identity.ownerName}
    onBooking={onBooking} onSignOut={onSignOut}
    refreshControl={<DashboardRefreshButton pending={false} refreshing={fetching} onRefresh={() => { void refreshCatalogWithToast(client, key); }} />}>
    <OwnerCatalogPreviewQuery section="packages" packagesDesign fontClassName={fontClassName} />
  </OwnerDashboardShell>;
}
