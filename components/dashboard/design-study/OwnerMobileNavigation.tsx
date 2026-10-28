"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { Content, Overlay, Portal } from "@radix-ui/react-dialog";
import { ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronRight, Flower2, LayoutDashboard, LogOut, Menu, Plus, Search, UserRound, Users, X } from "lucide-react";
import { Sheet, SheetClose, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import styles from "@/components/dashboard/design-study/owner-mobile-navigation.module.css";
import { isOwnerTeamPage, ownerTeamPages, type OwnerTeamPage } from "@/components/dashboard/design-study/OwnerTeamNavigation";
import type { OwnerBusinessPage } from "@/components/dashboard/design-study/OwnerBusinessNavigation";

import { isOwnerCustomerPage, ownerCustomerPages, ownerCustomerHref, type OwnerCustomerPage } from "@/components/dashboard/design-study/OwnerCustomerNavigation";

type SectionGroup = { title: string; items: string[][] };
const ENABLE_MOBILE_SECTION_PICKER = false;
type MobileSheet = "sections" | "workspace" | "account";
const workspaceGroups = [
  { title: "Customers", items: [["Customers", "customers"], ["Bookings", "bookings"], ["Customer inbox", "inbox"], ["Notifications", "notifications"]] },
  { title: "Your business", items: [["Services", "services"], ["Packages", "packages"], ["Vouchers", "vouchers"], ["Gift cards", "gift-cards"], ["Sale events", "sale-events"], ["Social posts", "social-posts"]] },
  { title: "Your people", items: [["Employees", "employees"], ["Owners", "owners"], ["Attendance", "attendance"], ["Payroll", "payroll"]] },
  { title: "Manage", items: [["Business settings", "business"], ["Business hours", "business-hours"], ["Notifications (current workspace)", "legacy-notifications"], ["Billing", "billing"], ["Reports", "reports"], ["Change password", "change-password"]] },
];

export default function OwnerMobileNavigation({ business, ownerName, onSignOut, onBooking, refreshControl, groups, canvasRef, onNavigate, fontClassName = "", pendingCount, activePage = "dashboard" }: {
  business?: { name: string; slug: string }; groups: SectionGroup[];
  ownerName?: string; onSignOut?: () => Promise<void>;
  onBooking?: (focusKey?: string) => void; refreshControl?: ReactNode;
  canvasRef: RefObject<HTMLElement | null>; onNavigate: (hash: string) => void;
  fontClassName?: string; pendingCount?: number; activePage?: "dashboard" | OwnerBusinessPage | OwnerTeamPage | OwnerCustomerPage;
}) {
  const [sheet, setSheet] = useState<MobileSheet>("workspace");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const opener = useRef<HTMLButtonElement | null>(null);
  const pendingSection = useRef<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const signOutLock = useRef(false);
  const signOutTrigger = useRef<HTMLButtonElement>(null);
  const verified = !!business && !!ownerName;
  const base = business ? `/app/${encodeURIComponent(business.slug)}` : null;
  const activeLabel = groups.flatMap(group => group.items).find(([, id]) => id === activeSection)?.[0] ?? "Overview";
  const filteredGroups = workspaceGroups.map(group => ({ ...group, items: group.items.filter(([label]) => label.toLowerCase().includes(search.trim().toLowerCase())) })).filter(group => group.items.length);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 639px)");
    let observer: IntersectionObserver | undefined;
    let changes: MutationObserver | undefined;
    const configure = () => {
      observer?.disconnect();
      changes?.disconnect();
      if (!mobile.matches) { setOpen(false); return; }
      if (!ENABLE_MOBILE_SECTION_PICKER) return;
      const canvas = canvasRef.current;
      if (!canvas || typeof IntersectionObserver === "undefined") return;
      const visible = new Map<Element, IntersectionObserverEntry>();
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target, entry);
          else visible.delete(entry.target);
        }
        const candidates = [...visible.keys()].map(target => ({ target, top: target.getBoundingClientRect().top })).sort((a, b) => a.top - b.top);
        const current = candidates.find(candidate => candidate.top >= 0) ?? candidates.at(-1);
        if (current) setActiveSection(current.target.id || "overview");
      }, { rootMargin: "-8% 0px -55% 0px", threshold: 0 });
      let targets: Element[] = [];
      const connect = () => {
        const next = [canvas.querySelector("h1"), ...groups.flatMap(group => group.items).filter(([, id]) => id !== "overview").map(([, id]) => canvas.querySelector(`#${id}`))].filter((item): item is Element => !!item);
        if (next.length === targets.length && next.every((item, i) => item === targets[i])) return;
        observer?.disconnect();
        visible.clear();
        targets = next;
        targets.forEach(target => observer?.observe(target));
      };
      connect();
      // Loading cards can be replaced independently without remounting the shell.
      changes = new MutationObserver(connect);
      changes.observe(canvas, { childList: true, subtree: true });
    };
    configure();
    mobile.addEventListener?.("change", configure);
    return () => { observer?.disconnect(); changes?.disconnect(); mobile.removeEventListener?.("change", configure); };
  }, [canvasRef, groups]);

  function openSheet(event: MouseEvent<HTMLButtonElement>, next: MobileSheet) {
    opener.current = event.currentTarget;
    pendingSection.current = null;
    setSearch("");
    if (!signOutLock.current) { setConfirmSignOut(false); setSignOutError(false); }
    setSheet(next);
    setOpen(true);
  }

  async function submitSignOut() {
    if (!verified || !onSignOut || signOutLock.current) return;
    signOutLock.current = true;
    setSigningOut(true);
    setSignOutError(false);
    try { await onSignOut(); }
    catch { setSignOutError(true); }
    finally { signOutLock.current = false; setSigningOut(false); }
  }

  function selectSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pendingSection.current = id;
    setOpen(false);
  }

  return <>
    <header className={styles.identityHeader} aria-label="Mobile workspace identity">
      <span className={styles.brandMark} aria-hidden="true"><Flower2 size={23} /></span>
      <div className={styles.identityText}><strong>{verified ? business.name : "Your workspace"}</strong><span>{verified ? `${ownerName} · Owner` : "Verifying your account"}</span></div>
      <div className={styles.refresh}>{refreshControl}</div>
      <button className={styles.accountButton} type="button" aria-label="Your account" aria-haspopup="dialog" aria-expanded={open && sheet === "account"} disabled={!verified} onClick={event => openSheet(event, "account")}><UserRound size={20} aria-hidden="true" /></button>
    </header>
    {ENABLE_MOBILE_SECTION_PICKER && <div className={styles.sectionBar}>
      <button type="button" aria-label={`On this page: ${activeLabel}`} aria-haspopup="dialog" aria-expanded={open && sheet === "sections"} onClick={event => openSheet(event, "sections")}>
        <span>On this page</span><strong>{activeLabel}</strong><ChevronDown size={15} aria-hidden="true" />
      </button>
    </div>}
    <nav className={styles.dock} aria-label="Mobile workspace">
      <Link href={activePage === "dashboard" ? "#overview" : "/redesign/owner-dashboard"} aria-current={activePage === "dashboard" ? "page" : undefined} onClick={event => {
        if (activePage !== "dashboard" || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onNavigate("#overview"); setActiveSection("overview");
      }}><span className={activePage === "dashboard" ? styles.selectedIcon : undefined}><LayoutDashboard size={21} aria-hidden="true" /></span><span>Dashboard</span></Link>
      {base ? <Link prefetch={false} href={ownerCustomerHref("bookings")} aria-current={activePage === "bookings" ? "page" : undefined}><span className={activePage === "bookings" ? styles.selectedIcon : undefined}><CalendarDays size={21} aria-hidden="true" /></span><span>Bookings</span></Link> : <button disabled><CalendarDays size={21} aria-hidden="true" /><span>Bookings</span></button>}
      <button className={styles.bookingAction} type="button" data-catalog-focus="redesign-mobile-new-booking" disabled={!business || !onBooking} onClick={() => onBooking?.("redesign-mobile-new-booking")}><span className={styles.bookingIcon}><Plus size={25} aria-hidden="true" /></span><span>New booking</span></button>
      {base ? <Link href="/redesign/owner-dashboard/team/employees" aria-current={isOwnerTeamPage(activePage) ? "page" : undefined}><span className={isOwnerTeamPage(activePage) ? styles.selectedIcon : undefined}><Users size={21} aria-hidden="true" /></span><span>Team</span></Link> : <button disabled><Users size={21} aria-hidden="true" /><span>Team</span></button>}
      <button type="button" aria-haspopup="dialog" aria-expanded={open && sheet === "workspace"} onClick={event => openSheet(event, "workspace")}><Menu size={21} aria-hidden="true" /><span>Menu</span></button>
    </nav>
    <Sheet open={open} onOpenChange={setOpen}>
      <Portal>
        <Overlay className={styles.overlay} />
        <Content className={`${styles.sheet} ${fontClassName}`} onCloseAutoFocus={event => {
          event.preventDefault();
          const id = pendingSection.current;
          pendingSection.current = null;
          if (id) { onNavigate(`#${id}`); setActiveSection(id); }
          else if (window.matchMedia("(max-width: 639px)").matches) opener.current?.focus();
          else canvasRef.current?.focus({ preventScroll: true });
        }}>
          <div className={styles.handle} aria-hidden="true" />
          <header className={styles.sheetHeader}>
            <div><span className={styles.eyebrow}>{sheet === "account" ? "YOUR ACCOUNT" : sheet === "sections" ? "YOUR DASHBOARD" : "YOUR WORKSPACE"}</span><SheetTitle className={styles.title}>{sheet === "sections" ? "Find your place." : business?.name ?? "Your workspace"}</SheetTitle><SheetDescription className={styles.description}>{sheet === "account" ? "Your workspace. Your account." : sheet === "sections" ? "A shortcut to every part of your day." : "The tools behind your everyday flow."}</SheetDescription></div>
            <SheetClose className={styles.close} aria-label={sheet === "account" ? "Close account" : "Close navigation"}><X size={19} aria-hidden="true" /></SheetClose>
          </header>
          {sheet === "workspace" && base && <label className={styles.search}><Search size={18} aria-hidden="true" /><input aria-label="Find a workspace page" placeholder="Find a page…" value={search} onChange={event => setSearch(event.target.value)} /></label>}
          <ScrollArea type="scroll" scrollHideDelay={800} className={styles.scroll}>
            <div className={styles.sheetBody}>
              {sheet === "account" ? <div className={styles.accountContent}>
                <div className={styles.accountIdentity}><span aria-hidden="true"><UserRound size={25} /></span><div><strong>{verified ? ownerName : "Your account"}</strong><small>Owner</small></div></div>
                {verified && base && <Link className={styles.accountLink} href={`${base}/change-password`} onClick={() => setOpen(false)}>Change password<ArrowUpRight size={17} aria-hidden="true" /></Link>}
                <div className={styles.signOutSection}>
                  <button ref={signOutTrigger} className={styles.signOutTrigger} type="button" disabled={!verified || !onSignOut || signingOut} aria-expanded={confirmSignOut} onClick={() => setConfirmSignOut(true)}><LogOut size={18} aria-hidden="true" />Sign out</button>
                  {confirmSignOut && <div className={styles.confirmation}>
                    <p>Sign out of this workspace?</p><small>You can sign back in whenever you need.</small>
                    {signOutError && <p role="alert">Couldn’t sign out. Please try again.</p>}
                    <div><button type="button" disabled={signingOut} onClick={() => { setConfirmSignOut(false); setSignOutError(false); signOutTrigger.current?.focus(); }}>Cancel</button><button type="button" disabled={signingOut} aria-busy={signingOut} onClick={submitSignOut}>{signingOut ? "Signing out…" : signOutError ? "Retry sign out" : "Sign out"}</button></div>
                  </div>}
                </div>
              </div> : sheet === "sections" && ENABLE_MOBILE_SECTION_PICKER ? <nav aria-label="Jump to dashboard section">{groups.map(group => <div className={styles.group} key={group.title}><h3>{group.title}</h3>{group.items.map(([label, id]) => <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined} onClick={event => selectSection(event, id)}><span>{label}</span>{id === "queue" && pendingCount !== undefined && <span className={styles.count}>{pendingCount}</span>}{activeSection === id ? <Check size={16} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}</a>)}</div>)}</nav> : base ? <nav aria-label="Workspace pages">
                {filteredGroups.map(group => <div className={styles.group} key={group.title}><h3>{group.title}</h3>{group.items.map(([label, path]) => ((isOwnerCustomerPage(path) && !ownerCustomerPages.find(item => item.page === path)?.enabled) || (isOwnerTeamPage(path) && !ownerTeamPages.find(item => item.page === path)?.enabled)) ? <button key={path} type="button" disabled className={styles.unavailable}><span>{label}</span><small>Coming soon</small></button> : <Link prefetch={false} key={path} href={path === "legacy-notifications" ? `${base}/notifications` : isOwnerCustomerPage(path) ? ownerCustomerHref(path) : isOwnerTeamPage(path) ? `/redesign/owner-dashboard/team/${path}` : ["services", "packages", "vouchers", "gift-cards", "sale-events", "social-posts", "business-hours", "billing", "reports"].includes(path) ? `/redesign/owner-dashboard/business/${path}` : `${base}/${path}`} onClick={() => setOpen(false)}><span>{label}</span><ArrowUpRight size={15} aria-hidden="true" /></Link>)}</div>)}
                {!filteredGroups.length && <p className={styles.noResults}>No pages match “{search}”. Try another name.</p>}
                <Link prefetch={false} className={styles.workspaceLink} href={base}><Flower2 size={18} aria-hidden="true" /><span>Open full workspace<small>All tools available to your account</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>
              </nav> : <p className={styles.noResults}>Your workspace links will appear once your account is verified.</p>}
            </div>
          </ScrollArea>
        </Content>
      </Portal>
    </Sheet>
  </>;
}

