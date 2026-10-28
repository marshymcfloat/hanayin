"use client";

import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

import { useCallback, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import type { OwnerCustomerPage } from "@/components/dashboard/design-study/OwnerCustomerNavigation";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { useOwnerBookingController } from "@/components/dashboard/owner-preview/OwnerBookingController";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";

export default function OwnerCustomerWorkspace({ page, children, fontClassName = "" }: { page: OwnerCustomerPage; children: ReactNode; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const client = useQueryClient();
  const { openBooking } = useOwnerBookingController();
  const key = ownerPreviewKeys.page(identity, page);
  const fetching = useIsFetching({ queryKey: key }) > 0;
  const onBooking = useCallback((focusKey = "redesign-new-booking") => openBooking(focusKey), [openBooking]);
  const onSignOut = useCallback(async () => { await signOut({ callbackUrl: "/" }); }, []);
  return <OwnerDashboardShell activePage={page} fontClassName={fontClassName} business={{ name: identity.businessName, slug: identity.businessSlug }} ownerName={identity.ownerName} onBooking={onBooking} onSignOut={onSignOut}
    refreshControl={<DashboardRefreshButton pending={false} refreshing={fetching} onRefresh={() => { void refreshTeamQueries(client, key); }} />}>{children}</OwnerDashboardShell>;
}
