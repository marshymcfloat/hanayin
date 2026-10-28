"use client";

import { useCallback, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import type { OwnerTeamPage } from "@/components/dashboard/design-study/OwnerTeamNavigation";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { useOwnerBookingController } from "@/components/dashboard/owner-preview/OwnerBookingController";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";
import { refreshTeamQueries } from "@/components/dashboard/owner-preview/refreshTeamQueries";

export default function OwnerTeamWorkspace({ page, children, fontClassName = "" }: { page: OwnerTeamPage; children: ReactNode; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const client = useQueryClient();
  const { openBooking } = useOwnerBookingController();
  const key = ownerPreviewKeys.section(identity, page, "page");
  const fetching = useIsFetching({ queryKey: key }) > 0;
  const payrollKey = ["payroll-lifecycle", identity.businessSlug, identity.userId];
  const payrollFetching = useIsFetching({ queryKey: payrollKey }) > 0;
  const onBooking = useCallback((focusKey = "redesign-new-booking") => openBooking(focusKey), [openBooking]);
  const onSignOut = useCallback(async () => { await signOut({ callbackUrl: "/" }); }, []);
  return <OwnerDashboardShell activePage={page} fontClassName={fontClassName} business={{ name: identity.businessName, slug: identity.businessSlug }} ownerName={identity.ownerName} onBooking={onBooking} onSignOut={onSignOut}
    refreshControl={<DashboardRefreshButton pending={false} refreshing={fetching || (page === "payroll" && payrollFetching)} onRefresh={() => { void refreshTeamQueries(client, key, page === "payroll" ? [payrollKey] : []); }} />}>
    {children}
  </OwnerDashboardShell>;
}
