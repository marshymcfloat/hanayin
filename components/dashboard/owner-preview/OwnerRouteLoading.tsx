"use client";

import type { ReactNode } from "react";
import { useViewer } from "@/lib/auth/viewer-context";
import { OwnerBusinessHoursPreviewSkeleton } from "./OwnerBusinessHoursPreviewSkeleton";
import { OwnerCatalogPreviewSkeleton } from "./OwnerCatalogPreviewSkeleton";
import { OwnerDashboardPreviewSkeleton } from "./OwnerDashboardPreviewSkeleton";
import { OwnerPreviewContentSkeleton } from "./OwnerPreviewContentSkeleton";

const contentSections = new Set(["attendance", "bookings", "growth", "payroll", "reports"]);

export function OwnerRouteLoading({ section, staffFallback }: { section: string; staffFallback?: ReactNode }) {
  const viewer = useViewer();

  if (viewer.actorType === "OWNER") {
    if (section === "dashboard") return <OwnerDashboardPreviewSkeleton />;
    if (section === "business hours") return <OwnerBusinessHoursPreviewSkeleton />;
    if (contentSections.has(section)) return <OwnerPreviewContentSkeleton />;
    return <OwnerCatalogPreviewSkeleton label={`${section} preview`} />;
  }

  if (staffFallback) return staffFallback;

  return (
    <main aria-busy="true" aria-label={`Loading ${section}`} className="min-h-dvh bg-background px-4 py-6 sm:px-6">
      <div className="animate-pulse space-y-6">
        <div className="space-y-3">
          <div className="h-7 w-48 rounded-lg bg-muted" />
          <div className="h-4 w-72 max-w-full rounded-lg bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 rounded-xl bg-muted" />)}
        </div>
        <div className="h-80 rounded-xl bg-muted" />
      </div>
    </main>
  );
}
