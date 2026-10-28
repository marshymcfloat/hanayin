"use client";

import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, CircleHelp, ContactRound, Flower2, LayoutDashboard, Plus, Scissors, UserRound, Users } from "lucide-react";
import DashboardRefreshButton from "@/components/dashboard/design-study/DashboardRefreshButton";
import OwnerMobileNavigation from "@/components/dashboard/design-study/OwnerMobileNavigation";
import OwnerBusinessNavigation, { ownerBusinessPageLabels, type OwnerBusinessPage } from "@/components/dashboard/design-study/OwnerBusinessNavigation";
import OwnerTeamNavigation, { isOwnerTeamPage, ownerTeamPageLabels, type OwnerTeamPage } from "@/components/dashboard/design-study/OwnerTeamNavigation";
import OwnerCustomerNavigation, { isOwnerCustomerPage, ownerCustomerPageLabels, type OwnerCustomerPage } from "@/components/dashboard/design-study/OwnerCustomerNavigation";
import styles from "@/components/dashboard/design-study/owner-dashboard-study.module.css";

const navigation = [
  { title: "Workspace", items: [["Overview", "overview"], ["Today’s bookings", "appointments"], ["Live queue", "queue"]] },
  { title: "Business insights", items: [["Performance", "performance"], ["Expenses", "expenses"], ["Growth", "growth"]] },
  { title: "Your people", items: [["Staff performance", "team"], ["Top customers", "customers"]] },
];


export default function OwnerDashboardShell({ children, fontClassName = "", business, ownerName, onSignOut, pendingCount, refreshControl, onBooking, rootRef, activePage = "dashboard" }: {
  activePage?: "dashboard" | OwnerBusinessPage | OwnerTeamPage | OwnerCustomerPage; children: ReactNode; fontClassName?: string; business?: { name: string; slug: string }; pendingCount?: number;
  ownerName?: string; onSignOut?: () => Promise<void>;
  refreshControl?: ReactNode; onBooking?: (focusKey?: string) => void; rootRef?: RefObject<HTMLDivElement | null>;
}) {
  const businessPath = business ? `/app/${encodeURIComponent(business.slug)}` : "";
  const customerPage = isOwnerCustomerPage(activePage);
  const teamPage = isOwnerTeamPage(activePage);
  const pageLabel = activePage === "dashboard" ? "Overview" : isOwnerTeamPage(activePage) ? ownerTeamPageLabels[activePage] : isOwnerCustomerPage(activePage) ? ownerCustomerPageLabels[activePage] : ownerBusinessPageLabels[activePage];
  const sectionHref = (target: string) => activePage === "dashboard" ? `#${target}` : `/redesign/owner-dashboard#${target}`;
  const canvasRef = useRef<HTMLElement>(null);

  const scrollToSection = useCallback((hash: string) => {
    const canvas = canvasRef.current;
    const target = document.getElementById(hash.slice(1));
    if (!canvas || !target || !canvas.contains(target)) return;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    if (target === canvas) {
      const scroller = window.matchMedia("(min-width: 640px)").matches ? canvas : window;
      scroller.scrollTo({ top: 0, behavior });
    } else {
      target.scrollIntoView({ behavior, block: "start" });
    }
  }, []);

  function navigateToSection(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const hash = event.currentTarget.getAttribute("href");
    if (!hash?.startsWith("#")) return;
    event.preventDefault();
    scrollToSection(hash);
  }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const showScrollbar = () => {
      if (canvas.dataset.scrolling !== "true") canvas.dataset.scrolling = "true";
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { delete canvas.dataset.scrolling; }, 800);
    };
    canvas.addEventListener("scroll", showScrollbar, { passive: true });
    return () => {
      canvas.removeEventListener("scroll", showScrollbar);
      clearTimeout(hideTimer);
      delete canvas.dataset.scrolling;
    };
  }, []);
  return (
    <div ref={rootRef} className={`${styles.page} ${fontClassName}`}>
      <a href="#overview" className={styles.skip} onClick={navigateToSection}>Skip to dashboard</a>
      <div className={styles.frame}>
        <nav className={styles.rail} aria-label="Workspace shortcuts">
          <Link href="/redesign" className={styles.brand} aria-label="HANAYIN landing page"><Flower2 size={23} /></Link>
          <Link href={sectionHref("overview")} onClick={navigateToSection} aria-label="Overview" aria-current={activePage === "dashboard" ? "page" : undefined}><LayoutDashboard size={19} /></Link>
          <Link href="/redesign/owner-dashboard/business/services" aria-label="Services" aria-current={activePage === "services" ? "page" : undefined}><Scissors size={19} /></Link>
          <Link href="/redesign/owner-dashboard/team/employees" aria-label="Team" aria-current={teamPage ? "page" : undefined}><Users size={19} /></Link>
          <Link href="/redesign/owner-dashboard/customers" aria-label="Customers" aria-current={customerPage ? "page" : undefined}><ContactRound size={19} /></Link>
          <div className={styles.railBottom}>{business && <Link href={`${businessPath}/bookings`} aria-label="All bookings"><Plus size={19} /></Link>}<Link href={sectionHref("preview-note")} onClick={navigateToSection} aria-label="About dashboard data"><CircleHelp size={19} /></Link><span className={styles.ownerAvatar} aria-label="Owner profile"><UserRound size={18} /></span></div>
        </nav>
        <aside className={styles.sidebar}>
          <div className={styles.businessName}><span>{business?.name ?? "Your workspace"}<small>Owner workspace</small></span><ChevronDown size={14} /></div>
          {isOwnerCustomerPage(activePage) ? <OwnerCustomerNavigation activePage={activePage} /> : isOwnerTeamPage(activePage) ? <OwnerTeamNavigation activePage={activePage} /> : activePage !== "dashboard" ? <OwnerBusinessNavigation activePage={activePage} /> : <>
          <div className={styles.sideIntro}>A little more room to grow.</div>
          <nav aria-label="Dashboard sections">{navigation.map((group) => <div className={styles.navGroup} key={group.title}><p>{group.title}</p>{group.items.map(([label, target]) => <Link key={target} href={sectionHref(target)} onClick={navigateToSection} className={activePage === "dashboard" && target === "overview" ? styles.navActive : ""}>{label}{target === "queue" && pendingCount !== undefined && <span aria-label={`${pendingCount} pending services`}>{pendingCount}</span>}</Link>)}</div>)}</nav>
          </>}
          <div className={styles.sideFoot}><Flower2 size={21} /><p>Made for your<br />everyday flow.</p><Link href="/redesign">Explore HANAYIN <ArrowUpRight size={13} /></Link></div>
        </aside>
        <div className={styles.mainColumn}>
          <header className={styles.topbar}><div className={styles.breadcrumb}>{customerPage ? "Customers" : teamPage ? "Team" : activePage !== "dashboard" ? "Business" : "Workspace"} <span>/</span> <strong>{pageLabel}</strong></div>{refreshControl ?? <DashboardRefreshButton pending onRefresh={() => {}} />}<button type="button" aria-label="New booking" data-catalog-focus="redesign-new-booking" className={styles.newBooking} onClick={() => onBooking?.("redesign-new-booking")} disabled={!onBooking}><Plus size={16} aria-hidden="true" /><span>New booking</span></button></header>
          <OwnerMobileNavigation activePage={activePage} business={business} ownerName={ownerName} onSignOut={onSignOut} onBooking={onBooking} refreshControl={refreshControl ?? <DashboardRefreshButton pending onRefresh={() => {}} />} groups={navigation} canvasRef={canvasRef} onNavigate={scrollToSection} fontClassName={fontClassName} pendingCount={pendingCount} />
          <main ref={canvasRef} className={styles.canvas} id="overview" tabIndex={0} aria-label={activePage === "dashboard" ? "Dashboard overview" : `${pageLabel} workspace`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
