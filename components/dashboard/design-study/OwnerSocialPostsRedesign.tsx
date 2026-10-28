"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import { signOut } from "next-auth/react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import { OwnerSocialPostsLoading } from "@/components/dashboard/design-study/OwnerSocialPostsLoading";
import { useOwnerPreviewContext } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { useOwnerBookingController } from "@/components/dashboard/owner-preview/OwnerBookingController";
import { ownerPreviewKeys } from "@/components/dashboard/owner-preview/owner-preview-query";

const SocialPosts = dynamic(() => import("@/components/dashboard/owner-preview/OwnerSocialPostsPreviewQuery").then(module => module.OwnerSocialPostsPreviewQuery), { loading: () => <OwnerSocialPostsLoading /> });

export default function OwnerSocialPostsRedesign({ fontClassName = "" }: { fontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const client = useQueryClient();
  const { openBooking } = useOwnerBookingController();
  const key = ownerPreviewKeys.page(identity, "social-posts");
  const fetching = useIsFetching({ queryKey: key }) > 0;
  const onBooking = useCallback((focusKey = "redesign-new-booking") => openBooking(focusKey), [openBooking]);
  const onSignOut = useCallback(async () => { await signOut({ callbackUrl: "/" }); }, []);
  return <OwnerDashboardShell activePage="social-posts" fontClassName={fontClassName} business={{ name: identity.businessName, slug: identity.businessSlug }} ownerName={identity.ownerName} onBooking={onBooking} onSignOut={onSignOut}
    refreshControl={<DashboardRefreshButton pending={false} refreshing={fetching} onRefresh={() => { void client.refetchQueries({ queryKey: key, type: "active" }); }} />}>
    <SocialPosts redesign fontClassName={fontClassName}/>
  </OwnerDashboardShell>;
}
