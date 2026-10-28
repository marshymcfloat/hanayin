"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import { signOut } from "next-auth/react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import { OwnerBusinessLoading } from "@/components/dashboard/design-study/OwnerBusinessLoading";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { useOwnerBookingController } from "@/components/dashboard/owner-preview/OwnerBookingController";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";

export type BusinessWorkspacePage = "business-hours" | "billing" | "reports";
const Hours = dynamic(() => import("@/components/dashboard/owner-preview/OwnerBusinessHoursPreviewQuery").then(module => module.OwnerBusinessHoursPreviewQuery), { loading: () => <OwnerBusinessLoading page="business-hours" /> });
const Billing = dynamic(() => import("@/components/dashboard/owner-preview/OwnerBillingPreviewQuery").then(module => module.OwnerBillingPreviewQuery), { loading: () => <OwnerBusinessLoading page="billing" /> });
const Reports = dynamic(() => import("@/components/dashboard/owner-preview/OwnerReportsPreview").then(module => module.OwnerReportsPreview), { loading: () => <OwnerBusinessLoading page="reports" /> });

export default function OwnerBusinessWorkspace({ page, fontClassName = "" }: { page: BusinessWorkspacePage; fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const client = useQueryClient();
  const { openBooking } = useOwnerBookingController();
  const key = ownerPreviewKeys.page(identity, page);
  const fetching = useIsFetching({ queryKey: key }) > 0;
  const onBooking = useCallback((focusKey = "redesign-new-booking") => openBooking(focusKey), [openBooking]);
  const onSignOut = useCallback(async () => { await signOut({ callbackUrl: "/" }); }, []);
  return <OwnerDashboardShell activePage={page} fontClassName={fontClassName} business={{ name: identity.businessName, slug: identity.businessSlug }} ownerName={identity.ownerName} onBooking={onBooking} onSignOut={onSignOut}
    refreshControl={<DashboardRefreshButton pending={false} refreshing={fetching} onRefresh={() => { void client.refetchQueries({ queryKey: key, type: "active" }); }} />}>
    {page === "business-hours" ? <Hours redesign fontClassName={fontClassName} /> : page === "billing" ? <Billing redesign fontClassName={fontClassName} /> : <Reports redesign />}
  </OwnerDashboardShell>;
}
