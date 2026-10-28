"use client";

import { usePathname } from "next/navigation";
import { OwnerInboxLoading } from "@/components/dashboard/design-study/OwnerInboxLoading";
import OwnerRedesignLoading from "@/components/dashboard/design-study/OwnerRedesignLoading";
import OwnerDashboardShell from "@/components/dashboard/design-study/OwnerDashboardShell";
import { OwnerServicesLoading } from "@/components/dashboard/design-study/OwnerServicesLoading";
import { OwnerVouchersLoading } from "@/components/dashboard/design-study/OwnerVouchersLoading";
import { OwnerGiftCardsLoading } from "@/components/dashboard/design-study/OwnerGiftCardsLoading";

import { OwnerSaleEventsLoading } from "@/components/dashboard/design-study/OwnerSaleEventsLoading";
import { OwnerBusinessLoading } from "@/components/dashboard/design-study/OwnerBusinessLoading";
import { OwnerSocialPostsLoading } from "@/components/dashboard/design-study/OwnerSocialPostsLoading";
import { OwnerEmployeesLoading } from "@/components/dashboard/design-study/OwnerEmployeesLoading";
import { OwnerOwnersLoading } from "@/components/dashboard/design-study/OwnerOwnersLoading";
import { OwnerAttendanceLoading } from "@/components/dashboard/design-study/OwnerAttendanceLoading";
import { OwnerPayrollLoading } from "@/components/dashboard/design-study/OwnerPayrollLoading";

import { OwnerCustomersLoading } from "@/components/dashboard/design-study/OwnerCustomersLoading";
import { OwnerBookingsLoading } from "@/components/dashboard/design-study/OwnerBookingsLoading";

import { OwnerNotificationsLoading } from "@/components/dashboard/design-study/OwnerNotificationsLoading";

export default function OwnerRedesignWorkspaceLoading({ fontClassName }: { fontClassName: string }) {
  const pathname = usePathname();
  if (pathname === "/redesign/owner-dashboard/team/payroll") return <OwnerDashboardShell activePage="payroll" fontClassName={fontClassName}><OwnerPayrollLoading /></OwnerDashboardShell>;
  if (pathname === "/redesign/owner-dashboard/customers/notifications") return <OwnerDashboardShell activePage="notifications" fontClassName={fontClassName}><OwnerNotificationsLoading /></OwnerDashboardShell>;
  if (pathname === "/redesign/owner-dashboard/customers/inbox") return <OwnerDashboardShell activePage="inbox" fontClassName={fontClassName}><OwnerInboxLoading /></OwnerDashboardShell>;
  if (pathname === "/redesign/owner-dashboard/customers/bookings") return <OwnerDashboardShell activePage="bookings" fontClassName={fontClassName}><OwnerBookingsLoading /></OwnerDashboardShell>;
  if (pathname === "/redesign/owner-dashboard/customers") return <OwnerDashboardShell activePage="customers" fontClassName={fontClassName}><OwnerCustomersLoading /></OwnerDashboardShell>;
  if (pathname === "/redesign/owner-dashboard/team/attendance") return <OwnerDashboardShell activePage="attendance" fontClassName={fontClassName}><OwnerAttendanceLoading /></OwnerDashboardShell>;
  if (pathname === "/redesign/owner-dashboard/team/owners") return <OwnerDashboardShell activePage="owners" fontClassName={fontClassName}><OwnerOwnersLoading /></OwnerDashboardShell>;
  if (pathname === "/redesign/owner-dashboard/team/employees") return <OwnerDashboardShell activePage="employees" fontClassName={fontClassName}><OwnerEmployeesLoading /></OwnerDashboardShell>;
  const businessPage = pathname.split("/").at(-1);
  if (businessPage === "social-posts") return <OwnerDashboardShell activePage="social-posts" fontClassName={fontClassName}><OwnerSocialPostsLoading/></OwnerDashboardShell>;
  if (businessPage === "business-hours" || businessPage === "billing" || businessPage === "reports") {
    return <OwnerDashboardShell activePage={businessPage} fontClassName={fontClassName}><OwnerBusinessLoading page={businessPage} /></OwnerDashboardShell>;
  }
  if (pathname === "/redesign/owner-dashboard/business/sale-events") {
    return <OwnerDashboardShell activePage="sale-events" fontClassName={fontClassName}><OwnerSaleEventsLoading fontClassName={fontClassName} /></OwnerDashboardShell>;
  }
  if (pathname === "/redesign/owner-dashboard/business/gift-cards") {
    return <OwnerDashboardShell activePage="gift-cards" fontClassName={fontClassName}><OwnerGiftCardsLoading fontClassName={fontClassName} /></OwnerDashboardShell>;
  }
  if (pathname === "/redesign/owner-dashboard/business/vouchers") {
    return <OwnerDashboardShell activePage="vouchers" fontClassName={fontClassName}><OwnerVouchersLoading fontClassName={fontClassName} /></OwnerDashboardShell>;
  }
  return pathname.endsWith("/services")
    ? <OwnerDashboardShell activePage="services" fontClassName={fontClassName}><OwnerServicesLoading /></OwnerDashboardShell>
    : <OwnerRedesignLoading fontClassName={fontClassName} />;
}
