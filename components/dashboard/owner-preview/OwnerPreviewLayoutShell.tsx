"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { PreviewDesktopRail, PreviewMobileNavigation, getPreviewDestination } from "./OwnerDashboardPreview";
import { useOwnerWorkspaceBasePath } from "./owner-preview-routing";
import { OwnerBookingControllerProvider, useOwnerBookingController } from "./OwnerBookingController";

export function OwnerPreviewLayoutShell({ businessSlug, children }: { businessSlug: string; children: ReactNode }) {
  const pathname = usePathname();
  const basePath = useOwnerWorkspaceBasePath();
  const routePath = pathname.replace(`${basePath}/${businessSlug}`, "");
  const active = getPreviewDestination(routePath) ?? "dashboard";
  const legacyPage = basePath === "/app" && (routePath === "/business" || routePath === "/change-password" || routePath === "/social-posts/my-requests");
  return (
    <OwnerBookingControllerProvider>
    <div className="min-h-dvh overflow-x-clip bg-[#F5F6F3] font-[var(--font-body)] text-[#20211F]">
      <PreviewDesktopRail businessSlug={businessSlug} active={active} />
      <OwnerBookingQuickActions businessSlug={businessSlug} active={active} />
      {legacyPage ? <div className="pb-24 md:pl-[128px] md:pb-0">{children}</div> : children}
    </div>
    </OwnerBookingControllerProvider>
  );
}

function OwnerBookingQuickActions({ businessSlug, active }: { businessSlug: string; active: Parameters<typeof PreviewMobileNavigation>[0]["active"] }) {
  const { openBooking, pending, recoveryAvailable } = useOwnerBookingController();

  return (
    <>
      <PreviewMobileNavigation businessSlug={businessSlug} active={active} onNewBooking={() => openBooking()} />
      <button type="button" onClick={() => openBooking()} disabled={pending} data-catalog-focus="owner-new-booking" aria-label={recoveryAvailable ? "Resume booking" : "New booking"} className="fixed bottom-7 right-7 z-40 hidden min-h-14 cursor-pointer items-center gap-2 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(23,24,23,0.24)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex"><Plus className="size-5" aria-hidden="true" />{pending ? "Creating booking…" : recoveryAvailable ? "Resume booking" : "New booking"}</button>
    </>
  );
}
