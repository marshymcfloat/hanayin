"use client";

import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  Crown,
  CircleHelp,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Gift,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Package,
  Percent,
  PhilippinePeso,
  Phone,
  Plus,
  ReceiptText,
  Ticket,
  TrendingUp,
  Search,
  Settings,
  Sparkles,
  Users,
  UserCircle,
  Wrench,
  Wallet,
  WalletCards,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ownerWorkspaceHref, useOwnerWorkspaceBasePath } from "./owner-preview-routing";
import { ExpenseCategory } from "@/prisma/generated/prisma/enums";
import { manilaDateInputValue, type DashboardExpenseDraft } from "@/features/dashboard/owner-preview-expense-optimism";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  OwnerDashboardPreviewBooking as PreviewBooking,
  OwnerDashboardPreviewKpi as PreviewKpi,
  OwnerDashboardPreviewQueueItem as PreviewQueueItem,
  OwnerDashboardPreviewRange,
  OwnerDashboardPreviewRankedItem as PreviewRankedItem,
  OwnerDashboardPreviewReadModel,
} from "@/features/dashboard/types/owner-dashboard-preview";

gsap.registerPlugin(useGSAP);

type Range = OwnerDashboardPreviewRange;

export type DashboardRefreshState = {
  isFetching: boolean;
  updatedAt: number;
  error: string | null;
  onRefresh: () => void;
};

export type DashboardRefreshControls = {
  all: DashboardRefreshState;
  performance: DashboardRefreshState;
  today: DashboardRefreshState;
  queue: DashboardRefreshState;
  growth: DashboardRefreshState;
  financials: DashboardRefreshState;
};

type DashboardChartControls = {
  selectedRange: Range;
  displayedRange: Range;
  onRangeChange: (range: Range) => void;
};

function SectionRefresh({ label, state, iconOnly = false }: { label: string; state?: DashboardRefreshState; iconOnly?: boolean }) {
  return state ? <OwnerPreviewRefreshControl label={label} iconOnly={iconOnly} {...state} /> : null;
}

const rangeOptions: { value: Range; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "month", label: "Month" },
  { value: "6m", label: "6 mo" },
  { value: "1y", label: "1 year" },
];

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const compactNumber = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`
      : value.toLocaleString("en-PH");

const navGroups = [
  {
    id: "business",
    label: "Business",
    icon: Package,
    items: [
      { label: "Services", path: "/services", icon: Package },
      { label: "Packages", path: "/packages", icon: WalletCards },
      { label: "Vouchers", path: "/vouchers", icon: Ticket },
      { label: "Gift cards", path: "/gift-cards", icon: Gift },
      { label: "Sale events", path: "/sale-events", icon: Percent },
      { label: "Social posts", path: "/social-posts", icon: Megaphone },
      { label: "My social requests", path: "/social-posts/my-requests", icon: ClipboardList },
      { label: "Growth", path: "/growth", icon: TrendingUp },
      { label: "Business hours", path: "/business-hours", icon: Clock3 },
      { label: "Billing", path: "/billing", icon: CreditCard },
      { label: "Reports", path: "/reports", icon: BarChart3 },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: Users,
    items: [
      { label: "Employees", path: "/employees", icon: UserCircle },
      { label: "Owners", path: "/owners", icon: Crown },
      { label: "Attendance", path: "/attendance", icon: ClipboardList },
      { label: "Payroll", path: "/payroll", icon: Wallet },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: CalendarDays,
    items: [
      { label: "Customers", path: "/customers", icon: Users },
      { label: "Bookings", path: "/bookings", icon: CalendarDays },
      { label: "Customer inbox", path: "/inbox", icon: MessageSquare },
      { label: "Notifications", path: "/notifications", icon: Bell },
    ],
  },
] as const;

const ownerRailTokens = {
  "--rail-width": "88px",
  "--rail-inline-padding": "20px",
  "--rail-dock-padding": "clamp(8px, 2dvh, 16px)",
  "--rail-item-size": "clamp(44px, 7dvh, 48px)",
  "--rail-anchor-size": "clamp(44px, 8dvh, 52px)",
  "--rail-icon-size": "20px",
  "--rail-item-radius": "15px",
  "--rail-gap": "clamp(2px, 0.5dvh, 10px)",
  "--rail-primary-gap": "clamp(6px, 1.5dvh, 12px)",
  "--rail-primary-section-gap": "clamp(8px, calc(4dvh - 8px), 24px)",
  "--rail-bg": "#171817",
  "--rail-muted": "rgba(255, 255, 255, 0.58)",
  "--rail-hover": "rgba(255, 255, 255, 0.075)",
  "--rail-selected": "rgba(255, 255, 255, 0.11)",
  "--rail-accent": "#72CF35",
} as CSSProperties;

function RailTooltip({ label }: { label: string }) {
  return <span role="tooltip" className="pointer-events-none absolute left-[calc(var(--rail-item-size)+var(--rail-inline-padding)+12px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-[10px] border border-white/8 bg-[#20211F] px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_8px_24px_rgba(23,24,23,0.16)] group-hover:block group-focus-visible:block">{label}</span>;
}

function BrandMark() {
  return (
    <div className="flex size-[var(--rail-anchor-size)] shrink-0 items-center justify-center rounded-[18px] bg-white text-[var(--rail-bg)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" aria-hidden="true">
      <Sparkles className="size-[var(--rail-icon-size)]" strokeWidth={2.5} />
    </div>
  );
}

type PreviewDestination =
  | "dashboard"
  | "services"
  | "packages"
  | "vouchers"
  | "gift-cards"
  | "social-posts"
  | "sale-events"
  | "growth"
  | "business-hours"
  | "billing"
  | "reports"
  | "employees"
  | "owners"
  | "attendance"
  | "payroll"
  | "customers"
  | "bookings"
  | "notifications"
  | "inbox";

export function getPreviewDestination(path: string): Exclude<PreviewDestination, "dashboard"> | null {
  const destination = path.slice(1);
  return [
    "services",
    "packages",
    "vouchers",
    "gift-cards",
    "social-posts",
    "sale-events",
    "growth",
    "business-hours",
    "billing",
    "reports",
    "employees",
    "owners",
    "attendance",
    "payroll",
    "customers",
    "bookings",
    "notifications",
    "inbox",
  ].includes(destination)
    ? (destination as Exclude<PreviewDestination, "dashboard">)
    : null;
}

function DesktopNav({ businessSlug, active = "dashboard" }: { businessSlug: string; active?: PreviewDestination }) {
  const basePath = useOwnerWorkspaceBasePath();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenGroup(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpenGroup(null);
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <nav ref={navRef} aria-label="Owner dashboard navigation" className="flex flex-col items-center gap-[var(--rail-primary-gap)]">
      <Link href={ownerWorkspaceHref(basePath, businessSlug)} aria-current={active === "dashboard" ? "page" : undefined} aria-label="Dashboard" className={cn("group relative flex size-[var(--rail-item-size)] items-center justify-center rounded-[var(--rail-item-radius)] text-white outline-none transition-colors duration-200 hover:bg-white/[0.14] focus-visible:ring-2 focus-visible:ring-[var(--rail-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--rail-bg)]", active === "dashboard" && "bg-[var(--rail-selected)]")}>
        {active === "dashboard" ? <span className="absolute -left-[var(--rail-inline-padding)] top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--rail-accent)]" /> : null}
        <LayoutDashboard className="size-[var(--rail-icon-size)]" />
        <RailTooltip label="Dashboard" />
      </Link>

      {navGroups.map((group) => {
        const Icon = group.icon;
        const isOpen = openGroup === group.id;
        return (
          <div key={group.id} className="relative size-[var(--rail-item-size)]">
            <button type="button" onClick={() => setOpenGroup(isOpen ? null : group.id)} aria-expanded={isOpen} aria-controls={`desktop-${group.id}-menu`} aria-label={`Open ${group.label} navigation`} className={cn("group flex size-[var(--rail-item-size)] cursor-pointer items-center justify-center rounded-[var(--rail-item-radius)] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--rail-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--rail-bg)]", isOpen ? "bg-[var(--rail-selected)] text-white" : "text-[var(--rail-muted)] hover:bg-[var(--rail-hover)] hover:text-white")}>
              <Icon className="size-[var(--rail-icon-size)]" />
              {!isOpen ? <RailTooltip label={group.label} /> : null}
            </button>
            {isOpen ? (
              <div id={`desktop-${group.id}-menu`} className="fixed left-[calc(20px+var(--rail-width)+12px)] top-[clamp(24px,10dvh,96px)] z-50 max-h-[calc(100dvh-clamp(24px,10dvh,96px)-12px)] w-[264px] overflow-y-auto rounded-[24px] border border-[#E1E3DE] bg-white p-3 shadow-[0_24px_70px_rgba(23,24,23,0.18)]">
                <div className="flex items-center justify-between px-2 pb-2 pt-1"><div><p className="text-sm font-bold text-[#20211F]">{group.label}</p><p className="mt-0.5 text-[11px] text-[#81847E]">Open a workspace</p></div><span className="font-mono text-[10px] text-[#9A9D97]">{group.items.length}</span></div>
                <div className="grid gap-1">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const previewDestination = getPreviewDestination(item.path);
                    const href = previewDestination ? ownerWorkspaceHref(basePath, businessSlug, item.path) : ownerWorkspaceHref("/app", businessSlug, item.path);
                    return <Link key={item.label} href={href} aria-current={previewDestination === active ? "page" : undefined} onClick={() => setOpenGroup(null)} className={cn("group/item flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-sm font-medium text-[#62655F] outline-none transition-colors hover:bg-[#F5F6F3] hover:text-[#20211F] focus-visible:bg-[#F5F6F3] focus-visible:ring-2 focus-visible:ring-[#72CF35]", previewDestination === active && "bg-[#EFF9E8] text-[#315E18]")}><ItemIcon className="h-4 w-4 text-[#9A9D97] group-hover/item:text-[#4D8F24]" /><span className="flex-1">{item.label}</span><ChevronRight className="h-3.5 w-3.5 text-[#C0C3BC]" /></Link>;
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function PreviewDesktopRail({ businessSlug, active = "dashboard" }: { businessSlug: string; active?: PreviewDestination }) {
  return (
    <aside style={ownerRailTokens} className="fixed inset-y-0 left-5 z-40 my-auto hidden h-fit w-[var(--rail-width)] flex-col items-center rounded-[26px] border border-white/[0.08] bg-[var(--rail-bg)] px-2 py-[var(--rail-dock-padding)] shadow-[0_16px_40px_rgba(23,24,23,0.18)] md:flex [@media(max-height:560px)]:absolute [@media(max-height:560px)]:top-2 [@media(max-height:560px)]:bottom-auto [@media(max-height:560px)]:my-0">
      <div role="group" aria-label="Primary navigation" className="flex w-full flex-col items-center">
        <BrandMark />
        <div className="mt-[var(--rail-primary-section-gap)]"><DesktopNav businessSlug={businessSlug} active={active} /></div>
      </div>
      <div aria-hidden="true" className="my-[clamp(6px,1dvh,12px)] h-px w-10 shrink-0 bg-white/[0.12]" />
      <div role="group" aria-label="Account controls" className="flex w-[calc(var(--rail-width)-16px)] flex-col items-center gap-[var(--rail-gap)] rounded-[18px] border border-white/[0.04] bg-white/[0.04] py-[clamp(5px,1dvh,8px)]">
        <Link href={`/app/${businessSlug}/business`} aria-label="Settings" className="group relative flex size-[var(--rail-item-size)] items-center justify-center rounded-[var(--rail-item-radius)] text-[var(--rail-muted)] outline-none transition-colors duration-200 hover:bg-[var(--rail-hover)] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--rail-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--rail-bg)]"><Settings className="size-[var(--rail-icon-size)]" /><RailTooltip label="Settings" /></Link>
        <Link href={`/app/${businessSlug}/change-password`} aria-label="Change password" className="group relative flex size-[var(--rail-item-size)] items-center justify-center rounded-[var(--rail-item-radius)] text-[var(--rail-muted)] outline-none transition-colors duration-200 hover:bg-[var(--rail-hover)] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--rail-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--rail-bg)]"><KeyRound className="size-[var(--rail-icon-size)]" /><RailTooltip label="Change password" /></Link>
        <button type="button" aria-label="Sign out" onClick={() => { void signOut({ callbackUrl: "/" }); }} className="group relative flex size-[var(--rail-item-size)] cursor-pointer items-center justify-center rounded-[var(--rail-item-radius)] text-[var(--rail-muted)] outline-none transition-colors duration-200 hover:bg-[var(--rail-hover)] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--rail-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--rail-bg)]"><LogOut className="size-[var(--rail-icon-size)]" /><RailTooltip label="Sign out" /></button>
        <div className="mt-[calc(var(--rail-gap)*0.5)] flex size-[var(--rail-anchor-size)] shrink-0 items-center justify-center rounded-[17px] border border-white/15 bg-[#EEE8DA] font-mono text-xs font-bold text-[#35342F]">AO</div>
      </div>
    </aside>
  );
}

export function PreviewMobileNavigation({ businessSlug, active = "dashboard", onNewBooking }: { businessSlug: string; active?: PreviewDestination; onNewBooking?: () => void }) {
  const basePath = useOwnerWorkspaceBasePath();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectedGroup = navGroups.find((group) => group.id === openGroup);
  const sheetTitle = selectedGroup?.label ?? "More";
  const activeTabIndex = openGroup === "business" ? 1 : openGroup === "customers" ? 3 : 4;

  const { contextSafe } = useGSAP(
    () => {
      if (!openGroup || !popoverRef.current) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const originX = `${(activeTabIndex + 0.5) * 20}%`;
      const timeline = gsap.timeline({ defaults: { overwrite: "auto" } });

      timeline.fromTo(
        popoverRef.current,
        { autoAlpha: 0, y: 10, scale: 0.975, transformOrigin: `${originX} 100%` },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: reducedMotion ? 0 : 0.3,
          ease: "power3.out",
        },
      );

      if (!reducedMotion) {
        timeline.fromTo(
          ".mobile-popover-item",
          { autoAlpha: 0, y: 5 },
          { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out", stagger: 0.018 },
          "-=0.18",
        );
      }
    },
    { dependencies: [openGroup], scope: navRef, revertOnUpdate: true },
  );

  const closePopover = useCallback(() => {
    contextSafe(() => {
      if (!openGroup || !popoverRef.current) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.to(popoverRef.current, {
        autoAlpha: 0,
        y: 7,
        scale: 0.985,
        duration: reducedMotion ? 0 : 0.18,
        ease: "power2.in",
        overwrite: true,
        onComplete: () => setOpenGroup(null),
      });
    })();
  }, [contextSafe, openGroup]);

  const toggleGroup = (groupId: string) => {
    if (openGroup === groupId) closePopover();
    else setOpenGroup(groupId);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && closePopover();
    const onPointerDown = (event: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) closePopover();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closePopover]);

  return (
    <>
      <nav ref={navRef} aria-label="Owner dashboard mobile navigation" className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        {openGroup ? (
          <div ref={popoverRef} role="menu" aria-label={`${sheetTitle} destinations`} className="absolute inset-x-3 bottom-[calc(100%+0.5rem)] mx-auto max-w-md rounded-[22px] border border-[#E7E9E4] bg-white/98 p-3 shadow-[0_20px_55px_rgba(23,24,23,0.14)] backdrop-blur-xl">
            <div className="mb-2 flex items-baseline justify-between px-1.5 py-1">
              <p className="text-sm font-bold tracking-[-0.02em] text-[#20211F]">{sheetTitle}</p>
              {selectedGroup ? <span className="font-mono text-[9px] text-[#9A9D97]">{selectedGroup.items.length} options</span> : null}
            </div>
            {selectedGroup ? (
              <div className="grid grid-cols-2">
                {selectedGroup.items.map((item) => {
                  const ItemIcon = item.icon;
                  const previewDestination = getPreviewDestination(item.path);
                  const href = previewDestination ? ownerWorkspaceHref(basePath, businessSlug, item.path) : ownerWorkspaceHref("/app", businessSlug, item.path);
                  return <Link role="menuitem" key={item.label} href={href} onClick={() => setOpenGroup(null)} aria-current={previewDestination === active ? "page" : undefined} className={cn("mobile-popover-item group flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-[12px] font-semibold text-[#343633] outline-none transition-colors duration-200 hover:bg-[#F5F6F3] hover:text-[#4D8F24] focus-visible:bg-[#EFF9E8] focus-visible:ring-2 focus-visible:ring-[#72CF35]", previewDestination === active && "bg-[#EFF9E8] text-[#315E18]")}><ItemIcon className="h-3.5 w-3.5 shrink-0 text-[#9A9D97] transition-colors duration-200 group-hover:text-[#4D8F24]" strokeWidth={1.7} /><span className="min-w-0 truncate">{item.label}</span></Link>;
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2">
                <button role="menuitem" type="button" onClick={() => setOpenGroup("team")} className="mobile-popover-item flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 text-[12px] font-semibold text-[#343633] outline-none transition-colors hover:bg-[#F5F6F3] focus-visible:ring-2 focus-visible:ring-[#72CF35]"><Users className="h-3.5 w-3.5 text-[#9A9D97]" strokeWidth={1.7} />Team</button>
                <Link role="menuitem" href={`/app/${businessSlug}/business`} onClick={() => setOpenGroup(null)} className="mobile-popover-item flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-[12px] font-semibold text-[#343633] outline-none transition-colors duration-200 hover:bg-[#F5F6F3] hover:text-[#4D8F24] focus-visible:bg-[#EFF9E8] focus-visible:ring-2 focus-visible:ring-[#72CF35]"><Settings className="h-3.5 w-3.5 text-[#9A9D97]" strokeWidth={1.7} />Settings</Link>
                <button role="menuitem" type="button" className="mobile-popover-item flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 text-[12px] font-semibold text-[#343633] outline-none transition-colors duration-200 hover:bg-[#F5F6F3] hover:text-[#4D8F24] focus-visible:bg-[#EFF9E8] focus-visible:ring-2 focus-visible:ring-[#72CF35]"><CircleHelp className="h-3.5 w-3.5 text-[#9A9D97]" strokeWidth={1.7} />Help</button>
                <Link role="menuitem" href={`/app/${businessSlug}/change-password`} onClick={() => setOpenGroup(null)} className="mobile-popover-item flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-[12px] font-semibold text-[#343633]"><KeyRound className="h-3.5 w-3.5 text-[#9A9D97]" strokeWidth={1.7} />Change password</Link>
                <button role="menuitem" type="button" onClick={() => { void signOut({ callbackUrl: "/" }); }} className="mobile-popover-item flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-[12px] font-semibold text-[#343633]"><LogOut className="h-3.5 w-3.5 text-[#9A9D97]" strokeWidth={1.7} />Sign out</button>
              </div>
            )}
            <span aria-hidden="true" className="absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-[#E7E9E4] bg-white" style={{ left: `calc(${(activeTabIndex + 0.5) * 20}% - 6px)` }} />
          </div>
        ) : null}
        <div className="mx-auto flex max-w-md items-center rounded-[24px] border border-white/8 bg-[#171817]/97 p-1.5 shadow-[0_18px_48px_rgba(23,24,23,0.28)] backdrop-blur-xl">
          <MobileTab href={ownerWorkspaceHref(basePath, businessSlug)} label="Dashboard" icon={LayoutDashboard} active={active === "dashboard"} onClick={() => setOpenGroup(null)} />
          <MobileGroupTab label="Business" icon={Package} active={openGroup === "business"} onClick={() => toggleGroup("business")} />
          <span className="flex min-w-0 flex-1 items-center justify-center"><button type="button" onClick={() => { setOpenGroup(null); onNewBooking?.(); }} data-catalog-focus="owner-new-booking" aria-label="New booking" className="grid size-14 min-w-14 cursor-pointer place-items-center rounded-full bg-[#B9F379] text-[#171817] shadow-[0_6px_18px_rgba(114,207,53,0.32)] outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#171817]"><Plus className="size-7" strokeWidth={2.5} aria-hidden="true" /></button></span>
          <MobileGroupTab label="Customers" icon={CalendarDays} active={openGroup === "customers"} onClick={() => toggleGroup("customers")} />
          <MobileGroupTab label="More" icon={MoreHorizontal} active={openGroup === "more"} onClick={() => toggleGroup("more")} />
        </div>
      </nav>
    </>
  );
}

function MobileGroupTab({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className={cn("relative flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[16px] px-0 text-[9px] font-semibold min-[360px]:px-1 min-[360px]:text-[10px] outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 focus-visible:ring-offset-[#171817]", active ? "bg-white/10 text-white" : "text-white/48 hover:text-white/75 active:bg-white/7")}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.8} />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function MobileTab({ href, label, icon: Icon, active = false, onClick }: { href: string; label: string; icon: LucideIcon; active?: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] px-0 text-[9px] font-semibold min-[360px]:px-1 min-[360px]:text-[10px] outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 focus-visible:ring-offset-[#171817]", active ? "bg-white/10 text-white" : "text-white/48 hover:text-white/75 active:bg-white/7")}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.8} />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

function DashboardEmptyState({ title, description, className }: { title: string; description: string; className?: string }) {
  return (
    <div className={cn("grid min-h-36 place-items-center rounded-[20px] border border-dashed border-[#D9DDD5] bg-[#FAFBF8] p-6 text-center", className)}>
      <div>
        <p className="text-sm font-semibold text-[#20211F]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#81847E]">{description}</p>
      </div>
    </div>
  );
}

function MetricCard({ item, featured = false }: { item: PreviewKpi; featured?: boolean }) {
  const completion = item.id === "completion";
  const expense = item.id === "expenses";
  const config = {
    revenue: {
      icon: PhilippinePeso,
      iconClass: "bg-[#EAF7E1] text-[#3D791E]",
    },
    expenses: {
      icon: ReceiptText,
      iconClass: "bg-[#FFF0F0] text-[#D94850]",
    },
    income: {
      icon: Wallet,
      iconClass: "bg-[#20211F] text-white",
    },
    completion: {
      icon: CalendarCheck2,
      iconClass: "bg-[#EFF9E8] text-[#4D8F24]",
    },
    average: {
      icon: BarChart3,
      iconClass: "bg-[#F0F1EE] text-[#424440]",
    },
  }[item.id];
  const Icon = config.icon;

  return (
    <article
      data-metric-card={item.id}
      className={cn(
        "group relative h-full min-h-[142px] min-w-0 overflow-hidden rounded-[22px] border border-white/90 bg-white p-3.5 shadow-[0_12px_32px_rgba(32,33,31,0.045)] transition-[border-color,box-shadow] duration-200 hover:border-[#DDE0D9] hover:shadow-[0_16px_38px_rgba(32,33,31,0.07)] sm:p-4",
        featured && "bg-[linear-gradient(135deg,#FFFFFF_0%,#FFFFFF_62%,#EEF8E8_100%)]",
      )}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[12px]", config.iconClass)}>
          <Icon className="h-[17px] w-[17px]" strokeWidth={2.1} aria-hidden="true" />
        </div>
        {completion ? (
          <div role="img" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#72CF35 ${item.value * 3.6}deg, #E7E9E4 0)` }} aria-label={`${item.value}% completion`}>
            <div className="grid h-7 w-7 place-items-center rounded-full bg-white font-mono text-[9px] font-bold text-[#3D791E]">{item.value}</div>
          </div>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-[#F5F6F3] px-2 py-1 text-[10px] font-semibold text-[#62655F]">
            This month
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-4 text-[#696C67] sm:text-xs">{item.label}</p>
      <div className="mt-1.5 flex min-w-0 items-start">
        {item.format === "currency" ? (
          <>
            <span className="mr-1 mt-[3px] font-[var(--font-body)] text-[13px] font-bold leading-none text-[#696C67]">₱</span>
            <span className="min-w-0 truncate font-mono text-[clamp(1.65rem,2.15vw,2.15rem)] font-semibold leading-none tracking-[-0.055em] text-[#20211F]">{compactNumber(item.value)}</span>
          </>
        ) : (
          <span className="font-mono text-[clamp(1.65rem,2.15vw,2.15rem)] font-semibold leading-none tracking-[-0.055em] text-[#20211F]">{item.value}<span className="ml-0.5 text-sm tracking-normal text-[#696C67]">%</span></span>
        )}
      </div>
      <p className={cn("mt-2 text-[10px] font-medium leading-4 sm:text-[11px]", expense ? "text-[#C74248]" : item.id === "income" ? "text-[#3D791E]" : "text-[#696C67]")}>{item.change}</p>
    </article>
  );
}

function FinancialChart({ range, data }: { range: Range; data: OwnerDashboardPreviewReadModel["financials"][Range] }) {
  const isMobile = useIsMobile();
  const rangeLabel = rangeOptions.find((option) => option.value === range)?.label ?? range;
  return (
    <div className="h-[240px] w-full min-w-0 sm:h-[340px] lg:h-[440px]" role="img" aria-label={`Revenue, expenses, and cashflow for ${rangeLabel}`}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 240 }}>
        <ComposedChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
          <defs><linearGradient id="ownerPreviewRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#72CF35" stopOpacity={0.24} /><stop offset="100%" stopColor="#72CF35" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#E7E9E4" strokeDasharray="3 7" />
          <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#696C67", fontSize: isMobile ? 10 : 12 }} dy={12} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#696C67", fontSize: isMobile ? 9 : 11 }} width={isMobile ? 34 : 52} tickMargin={isMobile ? 2 : 5} tickFormatter={(value) => isMobile ? `${value / 1000}k` : `₱${value / 1000}k`} />
          <Tooltip cursor={{ stroke: "#C9CCC5", strokeWidth: 1 }} content={({ active, payload, label }) => active && payload?.length ? <div className="min-w-48 rounded-2xl border border-[#E1E3DE] bg-white p-4 shadow-[0_18px_45px_rgba(32,33,31,0.14)]"><p className="mb-2 font-semibold text-[#20211F]">{label}</p>{payload.map((entry) => <div key={entry.dataKey} className="flex items-center justify-between gap-5 py-0.5 text-xs"><span className="capitalize text-[#696C67]">{String(entry.dataKey)}</span><span className="font-mono font-semibold text-[#20211F]">{peso.format(Number(entry.value))}</span></div>)}</div> : null} />
          <Area type="monotone" dataKey="revenue" stroke="#72CF35" strokeWidth={3} fill="url(#ownerPreviewRevenue)" activeDot={{ r: 5, fill: "#72CF35", stroke: "#fff", strokeWidth: 3 }} />
          <Bar dataKey="expenses" fill="#FF5B61" radius={[8, 8, 0, 0]} barSize={12} opacity={0.78} />
          <Line type="monotone" dataKey="cashflow" stroke="#20211F" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const expenseCategories = [
  { value: ExpenseCategory.SUPPLIES, label: "Supplies", icon: Package },
  { value: ExpenseCategory.UTILITIES, label: "Utilities", icon: Zap },
  { value: ExpenseCategory.RENT, label: "Rent", icon: Building2 },
  { value: ExpenseCategory.EQUIPMENT, label: "Equipment", icon: Wrench },
  { value: ExpenseCategory.MARKETING, label: "Marketing", icon: Megaphone },
  { value: ExpenseCategory.MAINTENANCE, label: "Maintenance", icon: Settings },
  { value: ExpenseCategory.PROFESSIONAL, label: "Professional", icon: Users },
  { value: ExpenseCategory.MISCELLANEOUS, label: "Miscellaneous", icon: MoreHorizontal },
] as const;

function PreviewExpenseDialog({ onSubmitExpense, pending }: { onSubmitExpense?: (expense: DashboardExpenseDraft) => Promise<{ success: boolean; error?: string }>; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>(ExpenseCategory.SUPPLIES);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const reset = () => {
    setAmount("");
    setCategory(ExpenseCategory.SUPPLIES);
    setDescription("");
    setDate("");
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (pending || submittingRef.current) return;
    if (nextOpen && !date) setDate(manilaDateInputValue());
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const submitPreviewExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !date) {
      setError("Enter an amount greater than ₱0.");
      return;
    }
    if (submittingRef.current || pending) return;
    if (!onSubmitExpense) {
      setError("Expense logging is unavailable.");
      return;
    }
    submittingRef.current = true;
    setError(null);
    setOpen(false);
    try {
      const result = await onSubmitExpense({
        amount: parsedAmount,
        category,
        description: description.trim() || undefined,
        date: new Date(`${date}T00:00:00+08:00`),
      });
      if (!result.success) {
        setError(result.error || "Failed to log expense.");
        return;
      }
      reset();
    } catch {
      setError("Could not confirm the save. Refresh or check expenses before retrying.");
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button type="button" aria-label="Log expense" onClick={() => handleOpenChange(true)} disabled={pending} className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-[#20211F] px-3.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"><Plus className="h-3.5 w-3.5" aria-hidden="true" /><span className="md:hidden">Expense</span><span className="hidden md:inline">Log expense</span></button>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[26px] border-[#E1E3DE] bg-white p-0 shadow-[0_28px_80px_rgba(23,24,23,0.24)] sm:max-w-[540px]">
        <DialogHeader className="border-b border-[#ECEEE9] px-5 pb-4 pt-6 text-left sm:px-6">
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-[13px] bg-[#FFF0F0] text-[#D94850]"><ReceiptText className="h-[18px] w-[18px]" /></div>
          <DialogTitle className="text-xl font-bold tracking-[-0.025em] text-[#20211F]">Log expense</DialogTitle>
          <DialogDescription>Record a business expense for the selected date.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submitPreviewExpense}>
          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div>
              <label htmlFor="preview-expense-amount" className="mb-2 block text-xs font-semibold text-[#20211F]">Amount <span className="text-[#D94850]">*</span></label>
              <div className="flex h-12 items-center rounded-2xl border border-[#DDE0D9] bg-[#FAFBF8] px-4 focus-within:border-[#72CF35] focus-within:ring-3 focus-within:ring-[#72CF35]/15">
                <span className="mr-2 text-sm font-bold text-[#696C67]">₱</span>
                <input id="preview-expense-amount" type="number" min="1" step="0.01" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null); }} placeholder="0.00" className="min-w-0 flex-1 bg-transparent font-mono text-base font-semibold text-[#20211F] outline-none placeholder:text-[#A4A7A1]" autoFocus />
              </div>
              {error ? <p role="alert" className="mt-2 text-xs font-medium text-[#C74248]">{error}</p> : null}
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-[#20211F]">Category</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {expenseCategories.map(({ value, label, icon: Icon }) => {
                  const selected = category === value;
                  return <button key={value} type="button" onClick={() => setCategory(value)} aria-pressed={selected} className={cn("flex min-h-[70px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 text-[10px] font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[#72CF35]", selected ? "border-[#20211F] bg-[#20211F] text-white" : "border-[#E1E3DE] bg-[#FAFBF8] text-[#62655F] hover:border-[#C8CBC4] hover:bg-white")}><Icon className="h-4 w-4" /><span>{label}</span></button>;
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="preview-expense-description" className="mb-2 block text-xs font-semibold text-[#20211F]">Description <span className="font-normal text-[#8A8D87]">(optional)</span></label>
              <input id="preview-expense-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Monthly water bill" className="h-12 w-full rounded-2xl border border-[#DDE0D9] bg-[#FAFBF8] px-4 text-sm outline-none placeholder:text-[#A4A7A1] focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/15" />
            </div>

            <div>
              <label htmlFor="preview-expense-date" className="mb-2 block text-xs font-semibold text-[#20211F]">Date</label>
              <input id="preview-expense-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-12 w-full rounded-2xl border border-[#DDE0D9] bg-[#FAFBF8] px-4 font-mono text-sm outline-none focus:border-[#72CF35] focus:ring-3 focus:ring-[#72CF35]/15" />
            </div>

          </div>

          <DialogFooter className="border-t border-[#ECEEE9] px-5 py-4 sm:flex-row sm:px-6">
            <DialogClose asChild><button type="button" className="min-h-11 cursor-pointer rounded-full border border-[#DDE0D9] bg-white px-5 text-sm font-semibold text-[#62655F] outline-none hover:bg-[#F5F6F3] focus-visible:ring-3 focus-visible:ring-[#72CF35]">Cancel</button></DialogClose>
            <button type="submit" disabled={pending} className="min-h-11 cursor-pointer rounded-full bg-[#20211F] px-5 text-sm font-semibold text-white outline-none hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">Log expense</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RankedPanel({ title, subtitle, items, emptyMessage, tone = "lime", action, notice, separateExpense }: { title: string; subtitle: string; items: PreviewRankedItem[]; emptyMessage: string; tone?: "lime" | "coral" | "ink"; action?: ReactNode; notice?: ReactNode; separateExpense?: { name: string; amount: number } | null }) {
  const bar = tone === "coral" ? "bg-[#FF5B61]" : tone === "ink" ? "bg-[#20211F]" : "bg-[#72CF35]";
  return (
    <section className="rounded-[30px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] lg:p-7">
      <div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold tracking-tight text-[#20211F]">{title}</h2><p className="mt-1 text-sm text-[#696C67]">{subtitle}</p></div>{action}</div>
      {notice}
      {separateExpense ? <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#ECEEE9] pb-4 text-sm text-[#20211F]"><span className="min-w-0 truncate font-semibold">{separateExpense.name}</span><span className="shrink-0 font-mono font-semibold">+{peso.format(separateExpense.amount)}</span></div> : null}
      {items.length ? (
        <ol className="space-y-5">{items.map((item) => <li key={item.name}><div className="flex items-end justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#20211F]">{item.name}</p><p className="mt-0.5 truncate text-xs text-[#696C67]">{item.detail}</p></div><span className="shrink-0 font-mono text-sm font-semibold text-[#20211F]">{peso.format(item.value)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F2F3F0]"><div className={cn("h-full rounded-full", bar)} style={{ width: `${item.share}%` }} /></div></li>)}</ol>
      ) : (
        <DashboardEmptyState title={`No ${title.toLowerCase()} yet`} description={emptyMessage} />
      )}
    </section>
  );
}

function bookingStatusClasses(status: PreviewBooking["status"]) {
  if (status === "In service") return "bg-[#EFF9E8] text-[#4D8F24] ring-[#72CF35]/20";
  if (status === "Pending") return "bg-[#FFF7E8] text-[#9B6516] ring-[#E6A23C]/25";
  return "bg-[#F0F1EE] text-[#62655F] ring-[#AEB2AA]/20";
}

function PreviewBookingDialog({ booking, businessSlug, open, onOpenChange }: { booking: PreviewBooking | null; businessSlug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[26px] border-[#E1E3DE] bg-white p-0 shadow-[0_28px_80px_rgba(23,24,23,0.24)] sm:max-w-[500px]" showCloseButton>
        <DialogHeader className="border-b border-[#ECEEE9] px-5 pb-5 pt-6 text-left sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-2 pr-8">
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", bookingStatusClasses(booking.status))}>{booking.status}</span>
            <span className="font-mono text-xs text-[#81847E]">Booking #{booking.id}</span>
            <span className="rounded-full bg-[#F5F6F3] px-2 py-1 text-[10px] font-semibold text-[#696C67]">Preview data</span>
          </div>
          <DialogTitle className="text-[1.35rem] font-bold tracking-[-0.025em] text-[#20211F]">{booking.customer}</DialogTitle>
          <DialogDescription className="sr-only">Preview details for booking {booking.id}</DialogDescription>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#696C67]">
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />Today</span>
            <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{booking.time}</span>
            {booking.phone ? <span className="flex items-center gap-1.5 text-[#4D8F24]"><Phone className="h-4 w-4" />{booking.phone}</span> : null}
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <section aria-labelledby="preview-service-heading">
            <h3 id="preview-service-heading" className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#81847E]">Service</h3>
            <div className="rounded-2xl border border-[#E1E3DE] bg-[#FAFBF8] p-4">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-semibold text-[#20211F]">{booking.service}</p><p className="mt-1 text-xs text-[#696C67]">with {booking.staff} · {booking.duration}</p></div>
                <span className="shrink-0 font-mono text-sm font-semibold">{peso.format(booking.total)}</span>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-[#E1E3DE] p-4" aria-label="Payment summary">
            <div><p className="text-xs text-[#81847E]">Booking total</p><p className="mt-1 font-mono text-sm font-bold text-[#20211F]">{peso.format(booking.total)}</p></div>
            <div><p className="text-xs text-[#81847E]">Expected deposit</p><p className="mt-1 font-mono text-sm font-bold text-[#4D8F24]">{peso.format(booking.deposit)}</p></div>
            <div><p className="text-xs text-[#81847E]">Payment status</p><p className="mt-1 text-sm font-semibold text-[#20211F]">Not recorded</p></div>
            <div><p className="text-xs text-[#81847E]">Assigned staff</p><p className="mt-1 text-sm font-semibold text-[#20211F]">{booking.staff}</p></div>
          </section>

          <div className="rounded-2xl bg-[#F5F6F3] px-4 py-3 text-xs leading-relaxed text-[#696C67]">
            This experimental dashboard uses dummy data. Booking actions are intentionally unavailable.
          </div>
        </div>

        <DialogFooter className="border-t border-[#ECEEE9] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <DialogClose asChild><button type="button" className="min-h-11 cursor-pointer rounded-full px-4 text-sm font-semibold text-[#62655F] outline-none hover:bg-[#F5F6F3] focus-visible:ring-3 focus-visible:ring-[#72CF35]">Close</button></DialogClose>
          <Link href={`/owner-dashboard-preview/${businessSlug}/bookings?bookingId=${booking.id}`} className="inline-flex min-h-11 items-center rounded-full bg-[#20211F] px-5 text-sm font-semibold text-white">Manage booking</Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TodaysBookingsPanel({ businessSlug, bookings, refresh }: { businessSlug: string; bookings: PreviewBooking[]; refresh?: DashboardRefreshState }) {
  const [selectedBooking, setSelectedBooking] = useState<PreviewBooking | null>(null);
  return (
    <section className="relative flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] lg:p-6" aria-labelledby="bookings-heading">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#EFF9E8] opacity-70" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-[13px] bg-[#EFF9E8] text-[#4D8F24]">
            <CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" />
          </div>
          <h2 id="bookings-heading" className="text-lg font-bold tracking-tight">Today’s bookings</h2>
          <p className="mt-1 text-sm text-[#696C67]">Next appointments across the team</p>
        </div>
        <div className="relative flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-[#F5F6F3] px-2.5 py-1 font-mono text-xs font-semibold text-[#62655F]">{bookings.length} today</span>
          <SectionRefresh label="today’s bookings" state={refresh} iconOnly />
        </div>
      </div>

      {bookings.length ? <ol className="mt-5 flex-1 space-y-1.5">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <button type="button" onClick={() => setSelectedBooking(booking)} aria-label={`Open booking ${booking.id} for ${booking.customer}`} className="group/booking flex min-h-[72px] w-full cursor-pointer items-start gap-3 rounded-2xl px-2.5 py-3 text-left outline-none transition-colors hover:bg-[#F7F8F5] focus-visible:bg-[#F7F8F5] focus-visible:ring-3 focus-visible:ring-[#72CF35]">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EFF0EC] font-mono text-[10px] font-bold text-[#555852] transition-colors group-hover/booking:bg-[#E7F4DF] group-hover/booking:text-[#4D8F24]">{booking.customer.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[#20211F]">{booking.customer}</p>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#B0B3AC] transition-transform group-hover/booking:translate-x-0.5 group-hover/booking:text-[#4D8F24]" aria-hidden="true" />
                </div>
                <p className="mt-0.5 truncate text-xs text-[#696C67]">{booking.service}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <time className="font-mono text-[10px] font-semibold text-[#62655F]">{booking.time}</time>
                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ring-inset", bookingStatusClasses(booking.status))}>{booking.status}</span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ol> : <DashboardEmptyState title="No bookings today" description="Scheduled appointments will appear here." className="mt-5 flex-1" />}

      <Link href={`/app/${businessSlug}/bookings`} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#20211F] px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2">
        View full schedule
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <PreviewBookingDialog booking={selectedBooking} businessSlug={businessSlug} open={selectedBooking !== null} onOpenChange={(nextOpen) => !nextOpen && setSelectedBooking(null)} />
    </section>
  );
}

function PreviewGrowthOpportunity({
  businessSlug,
  growth,
  occupancyAvailability,
  refresh,
}: {
  businessSlug: string;
  growth: OwnerDashboardPreviewReadModel["growth"];
  occupancyAvailability: OwnerDashboardPreviewReadModel["availability"]["growthOccupancy"];
  refresh?: DashboardRefreshState;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const opportunity = growth.opportunity;
  const timeWindow = opportunity
    ? [opportunity.timeWindowStart, opportunity.timeWindowEnd].filter(Boolean).join("–")
    : "";

  return (
    <section className="flex h-full flex-col rounded-[30px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)]" aria-labelledby="growth-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#EFF9E8] text-[#4D8F24]"><TrendingUp className="h-4 w-4" aria-hidden="true" /></div>
          <div><h2 id="growth-heading" className="text-base font-bold tracking-tight">Growth opportunity</h2><p className="mt-0.5 text-xs text-[#696C67]">Business growth signal</p></div>
        </div>
        <SectionRefresh label="growth opportunity" state={refresh} iconOnly />
      </div>

      <div className="mt-4 flex-1">
        {!growth.enabled ? (
          <DashboardEmptyState title="Growth insights unavailable" description="Growth insights are not enabled for this business." className="min-h-32" />
        ) : opportunity ? (
          <>
            <div className="flex items-start gap-2.5"><span className="inline-flex shrink-0 rounded-md bg-[#EFF9E8] px-2 py-1 font-mono text-[10px] font-bold text-[#4D8F24]">{opportunity.confidence}%</span><p className="text-[13px] font-medium leading-5 text-[#20211F]">{opportunity.reason}</p></div>
            {occupancyAvailability === "unavailable" ? <div className="mt-3 rounded-[14px] bg-[#F7F8F5] px-3 py-2.5"><p className="text-[10px] font-semibold text-[#62655F]">Occupancy unavailable</p><p className="mt-0.5 text-[10px] leading-4 text-[#92958F]">No occupancy estimate is available for this opportunity.</p></div> : null}

            {showDetails ? (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-[14px] bg-[#F7F8F5] p-2.5 text-[10px]">
                <div><p className="text-[#8A8D87]">Best window</p><p className="mt-0.5 font-semibold">{timeWindow || "Unavailable"}</p></div>
                <div><p className="text-[#8A8D87]">Recommended offer</p><p className="mt-0.5 line-clamp-2 font-semibold">{opportunity.recommendedOfferTypes.join(", ") || "Unavailable"}</p></div>
              </div>
            ) : null}
          </>
        ) : (
          <DashboardEmptyState title="No growth opportunity" description="There is no current opportunity to review." className="min-h-32" />
        )}
      </div>

      {growth.enabled && opportunity ? <div className="mt-3 flex items-center gap-2">
          <Link href={`/owner-dashboard-preview/${businessSlug}/sale-events`} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#20211F] px-3 text-xs font-semibold text-white outline-none transition-colors hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2"><Megaphone className="h-3.5 w-3.5" />Create offer</Link>
          <button type="button" onClick={() => setShowDetails((current) => !current)} aria-expanded={showDetails} aria-label={showDetails ? "Hide opportunity details" : "Show opportunity details"} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-[#F5F6F3] text-[#696C67] outline-none hover:bg-[#ECEEE9] hover:text-[#20211F] focus-visible:ring-2 focus-visible:ring-[#72CF35]"><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} /></button>
        </div> : null}
    </section>
  );
}

export type DashboardQueueAction = "claim" | "unclaim" | "serve" | "unserve";

const queueActionHitClass = "group/queue-action inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#72CF35] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
const queuePrimarySurfaceClass = "inline-flex h-7 items-center justify-center rounded-[9px] bg-[#20211F] px-2.5 text-[10px] font-bold text-white transition-colors group-hover/queue-action:bg-[#343633]";
const queueSecondarySurfaceClass = "inline-flex h-7 items-center justify-center rounded-[9px] px-2 text-[10px] font-semibold text-[#62655F] transition-colors group-hover/queue-action:bg-[#EAEEE7] group-hover/queue-action:text-[#20211F]";

function PreviewLiveQueue({ queue, refresh, onVisibilityChange, onAction }: { queue: PreviewQueueItem[]; refresh?: DashboardRefreshState; onVisibilityChange?: (visible: boolean) => void; onAction?: (action: DashboardQueueAction, serviceId: number) => Promise<{ success: boolean; error?: string }> }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "in-progress" | "done">("pending");
  const [actingId, setActingId] = useState<number | null>(null);
  const actingIdRef = useRef<number | null>(null);
  const tabChangeVersion = useRef(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const queueTab = (status: PreviewQueueItem["status"]) => status === "PENDING" ? "pending" : status === "COMPLETED" ? "done" : "in-progress";
  const visibleItems = queue.filter((item) => queueTab(item.status) === activeTab);
  const pendingCount = queue.filter((item) => item.status === "PENDING").length;
  const inProgressCount = queue.filter((item) => item.status === "CLAIMED" || item.status === "SERVING").length;
  const doneCount = queue.filter((item) => item.status === "COMPLETED").length;

  useEffect(() => {
    if (!onVisibilityChange || !sectionRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => onVisibilityChange(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      onVisibilityChange(false);
    };
  }, [onVisibilityChange]);

  const runAction = async (action: DashboardQueueAction, id: number) => {
    if (!onAction || actingIdRef.current !== null) return;
    actingIdRef.current = id;
    const previousTab = activeTab;
    const actionTab = action === "claim" || action === "unserve" ? "in-progress" : action === "serve" ? "done" : "pending";
    const startingTabVersion = tabChangeVersion.current;
    setActingId(id);
    setActionError(null);
    setActiveTab(actionTab);
    try {
      const result = await onAction(action, id);
      if (!result.success) {
        setActionError(result.error || "Unable to update the queue. Please try again.");
        if (tabChangeVersion.current === startingTabVersion) setActiveTab(previousTab);
      }
    } catch {
      setActionError("Unable to update the queue. Please try again.");
      if (tabChangeVersion.current === startingTabVersion) setActiveTab(previousTab);
    } finally {
      actingIdRef.current = null;
      setActingId(null);
    }
  };

  return (
    <section ref={sectionRef} className="flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] lg:p-6" aria-labelledby="live-queue-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#EFF9E8] text-[#4D8F24]"><ClipboardList className="h-[18px] w-[18px]" aria-hidden="true" /></div>
          <div className="min-w-0"><div className="flex items-center gap-2"><h2 id="live-queue-heading" className="text-lg font-bold tracking-tight">Live queue</h2><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#4D8F24]">Live</span></div><p className="mt-1 text-sm text-[#696C67]">Services waiting for an owner</p></div>
        </div>
        <SectionRefresh label="live queue" state={refresh} iconOnly />
      </div>

      {actionError ? <p className="mt-3 rounded-xl bg-[#FFF0F0] px-3 py-2 text-xs font-medium text-[#A12F37]" role="alert">{actionError}</p> : null}
      <div className="mt-4 grid grid-cols-3 rounded-[15px] bg-[#F5F6F3] p-1" role="tablist" aria-label="Queue status">
        {([
          { value: "pending" as const, label: "Pending", count: pendingCount },
          { value: "in-progress" as const, label: "In progress", count: inProgressCount },
          { value: "done" as const, label: "Done", count: doneCount },
        ]).map((tab) => (
          <button key={tab.value} type="button" role="tab" aria-selected={activeTab === tab.value} onClick={() => { tabChangeVersion.current += 1; setActiveTab(tab.value); }} className={cn("flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[12px] px-3 text-xs font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#72CF35]", activeTab === tab.value ? "bg-white text-[#20211F] shadow-[0_3px_12px_rgba(32,33,31,0.06)]" : "text-[#81847E] hover:text-[#20211F]")}>{tab.label}<span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[9px]", activeTab === tab.value ? "bg-[#20211F] text-white" : "bg-white/70 text-[#81847E]")}>{tab.count}</span></button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {visibleItems.length ? (
          <ul className="space-y-1.5">
            {visibleItems.map((item) => (
              <li key={item.id} className="group rounded-[17px] bg-[#F7F8F5] px-3 py-1.5 transition-colors hover:bg-[#F1F3EE]">
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold leading-tight text-[#20211F]">{item.service}</p><p className="mt-1 truncate text-[10px] text-[#81847E]">{item.customer} · <span className="font-mono">{item.time}</span></p></div>
                  <div className="flex shrink-0 items-center gap-1"><p className="font-mono text-[11px] font-bold text-[#20211F]">{peso.format(item.price)}</p>{actingId === item.id ? <span role="status" className="inline-flex min-h-11 items-center px-2 text-[10px] font-semibold text-[#4D8F24]">Saving…</span> : item.status === "PENDING" ? <button type="button" onClick={() => void runAction("claim", item.id)} disabled={!onAction || actingId !== null} className={queueActionHitClass}><span className={queuePrimarySurfaceClass}>Claim</span></button> : item.status === "COMPLETED" ? <button type="button" onClick={() => void runAction("unserve", item.id)} disabled={!onAction || actingId !== null} className={queueActionHitClass}><span className={queueSecondarySurfaceClass}>Undo</span></button> : <div className="flex items-center"><button type="button" onClick={() => void runAction("serve", item.id)} disabled={!onAction || actingId !== null} className={queueActionHitClass}><span className={queuePrimarySurfaceClass}>Done</span></button><button type="button" onClick={() => void runAction("unclaim", item.id)} disabled={!onAction || actingId !== null} className={queueActionHitClass}><span className={queueSecondarySurfaceClass}>Return</span></button></div>}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-[#D9DDD5] bg-[#FAFBF8] p-6 text-center"><div><p className="text-sm font-semibold">Queue is clear</p><p className="mt-1 text-xs text-[#81847E]">No services in this state.</p></div></div>
        )}
      </div>

      <p aria-live="polite" className="mt-3 border-t border-[#ECEEE9] pt-3 text-[10px] font-medium text-[#9A9D97]">{actingId !== null ? "Saving queue change…" : "Queue changes appear immediately and revert if they cannot be saved."}</p>
    </section>
  );
}

export type DashboardExpenseFeedback = { pending: boolean; status: string | null; error: string | null; separate: { name: string; amount: number } | null };

export function OwnerDashboardPreview({ dashboardData, ownerName, refresh, chart, onQueueVisibilityChange, onQueueAction, onExpenseSubmit, expenseFeedback }: {
  dashboardData: OwnerDashboardPreviewReadModel;
  ownerName: string;
  refresh?: DashboardRefreshControls;
  chart?: DashboardChartControls;
  onQueueVisibilityChange?: (visible: boolean) => void;
  onQueueAction?: (action: DashboardQueueAction, serviceId: number) => Promise<{ success: boolean; error?: string }>;
  onExpenseSubmit?: (expense: DashboardExpenseDraft) => Promise<{ success: boolean; error?: string }>;
  expenseFeedback?: DashboardExpenseFeedback;
}) {
  const [localRange, setLocalRange] = useState<Range>("month");
  const range = chart?.displayedRange ?? localRange;
  const [compactHeader, setCompactHeader] = useState(false);
  const stickyHeaderRef = useRef<HTMLElement>(null);
  const compactHeaderStateRef = useRef(false);
  const businessSlug = dashboardData.business.slug;
  const businessName = dashboardData.business.name;
  const firstName = ownerName.split(" ")[0] || "Owner";
  const financialData = dashboardData.financials[range] ?? [];
  const orderedKpis = useMemo(() => {
    const revenue = dashboardData.kpis.find((item) => item.id === "revenue");
    return revenue
      ? [revenue, ...dashboardData.kpis.filter((item) => item.id !== "revenue")]
      : dashboardData.kpis;
  }, [dashboardData.kpis]);

  useEffect(() => {
    let frame: number | null = null;
    const updateHeader = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        const isDesktop = window.innerWidth >= 768;
        const nextCompact = compactHeaderStateRef.current
          ? window.scrollY > (isDesktop ? 48 : 12)
          : window.scrollY > (isDesktop ? 128 : 52);

        if (nextCompact !== compactHeaderStateRef.current) {
          compactHeaderStateRef.current = nextCompact;
          setCompactHeader(nextCompact);
        }
        frame = null;
      });
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    window.addEventListener("resize", updateHeader);
    return () => {
      window.removeEventListener("scroll", updateHeader);
      window.removeEventListener("resize", updateHeader);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#F5F6F3] font-[var(--font-body)] text-[#20211F]">
      <main className="pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-[128px]">
        <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
          <header ref={stickyHeaderRef} className="sticky top-0 z-30 mb-8 h-[108px] md:top-4 md:h-[101px]">
            <div aria-hidden={compactHeader} className={cn("absolute inset-x-0 top-0 flex origin-top items-start justify-between transition-[transform,opacity,filter] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", compactHeader ? "pointer-events-none -translate-y-2 scale-[0.99] opacity-0 blur-[3px]" : "translate-y-0 scale-100 opacity-100 blur-none")}>
              <div className="min-w-0">
                <p className="mb-2 text-sm font-semibold text-[#696C67]">{businessName}</p>
                <div className="flex items-start justify-between gap-4"><h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold leading-tight tracking-[-0.035em]">Good morning, {firstName}</h1><Link href={`/owner-dashboard-preview/${businessSlug}/notifications`} aria-label="View notification history" tabIndex={compactHeader ? -1 : 0} className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#E1E3DE] bg-white text-[#20211F] outline-none transition-colors hover:bg-[#EFF9E8] focus-visible:ring-3 focus-visible:ring-[#72CF35] md:hidden"><Bell className="h-[18px] w-[18px]" /></Link></div>
                <p className="mt-2 max-w-2xl text-sm text-[#696C67] sm:text-base">A clear view of bookings, team output, and business performance.</p>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <button type="button" aria-label="Search dashboard" tabIndex={compactHeader ? -1 : 0} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[#E1E3DE] bg-white text-[#20211F] outline-none transition-colors hover:bg-[#EFF9E8] focus-visible:ring-3 focus-visible:ring-[#72CF35]"><Search className="h-[18px] w-[18px]" /></button>
                <Link href={`/owner-dashboard-preview/${businessSlug}/notifications`} aria-label="View notification history" tabIndex={compactHeader ? -1 : 0} className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[#E1E3DE] bg-white text-[#20211F] outline-none transition-colors hover:bg-[#EFF9E8] focus-visible:ring-3 focus-visible:ring-[#72CF35]"><Bell className="h-[18px] w-[18px]" /></Link>
              </div>
            </div>

            <div aria-hidden={!compactHeader} className={cn("absolute inset-x-0 top-3 origin-top rounded-[22px] border border-[#E1E3DE]/90 bg-white px-2.5 py-2.5 shadow-[0_14px_38px_rgba(32,33,31,0.12)] ring-1 ring-white transition-[transform,opacity,filter] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:top-0 md:px-3", compactHeader ? "translate-y-0 scale-100 opacity-100 blur-none" : "pointer-events-none -translate-y-3 scale-[0.985] opacity-0 blur-[5px]")}>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#171817] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] md:h-9 md:w-9 md:rounded-[12px]"><Sparkles className="h-[17px] w-[17px]" strokeWidth={2.1} aria-hidden="true" /></div>
                  <div className="min-w-0"><p className="truncate text-[15px] font-bold leading-tight tracking-[-0.025em] text-[#20211F] md:text-sm">Good morning, {firstName}</p><p className="mt-0.5 truncate text-[10px] font-medium text-[#81847E]">{businessName} · Owner overview</p></div>
                </div>
                <Link href={`/owner-dashboard-preview/${businessSlug}/notifications`} aria-label="View notification history" tabIndex={compactHeader ? 0 : -1} className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#E7E9E4] bg-[#F5F6F3] text-[#20211F] outline-none transition-colors hover:bg-[#EFF9E8] focus-visible:ring-3 focus-visible:ring-[#72CF35] md:hidden"><Bell className="h-[16px] w-[16px]" strokeWidth={1.9} /></Link>
                <div className="hidden items-center gap-2 md:flex">
                  <button type="button" aria-label="Search dashboard" tabIndex={compactHeader ? 0 : -1} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#E1E3DE] bg-[#F8F9F6] text-[#20211F] outline-none transition-colors hover:bg-[#EFF9E8] focus-visible:ring-3 focus-visible:ring-[#72CF35]"><Search className="h-[17px] w-[17px]" /></button>
                  <Link href={`/owner-dashboard-preview/${businessSlug}/notifications`} aria-label="View notification history" tabIndex={compactHeader ? 0 : -1} className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#E1E3DE] bg-[#F8F9F6] text-[#20211F] outline-none transition-colors hover:bg-[#EFF9E8] focus-visible:ring-3 focus-visible:ring-[#72CF35]"><Bell className="h-[17px] w-[17px]" /></Link>
                </div>
              </div>
            </div>
          </header>

          {refresh ? <div className="mb-4"><SectionRefresh label="dashboard" state={refresh.all} /></div> : null}
          <section aria-label="Monthly performance">
            <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 xl:grid-cols-[minmax(240px,1.55fr)_repeat(4,minmax(0,1fr))] xl:gap-3.5">{orderedKpis.length ? orderedKpis.map((item) => <div key={item.id} className={cn("min-w-0", item.id === "revenue" && "col-span-2 xl:col-span-1")}><MetricCard item={item} featured={item.id === "revenue"} /></div>) : <DashboardEmptyState title="Performance data unavailable" description="No performance metrics are available for this period." className="col-span-2 min-h-36 sm:col-span-3 xl:col-span-5" />}</div>
          </section>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
            <section className="min-w-0 rounded-[32px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:p-7 lg:p-8" aria-labelledby="financial-heading">
              <div className="flex items-start justify-between gap-3"><div><h2 id="financial-heading" className="text-lg font-bold tracking-tight sm:text-xl">Financial pulse</h2><p className="mt-1 hidden text-sm text-[#696C67] sm:block">Revenue, expenses, and cashflow</p></div><div className="flex shrink-0 items-center gap-1"><SectionRefresh label="financial chart" state={refresh?.financials} iconOnly /><Select value={chart?.selectedRange ?? localRange} onValueChange={(value) => chart ? chart.onRangeChange(value as Range) : setLocalRange(value as Range)}><SelectTrigger aria-label="Chart range" className="h-9 w-[116px] shrink-0 cursor-pointer gap-3 rounded-full border-[#20211F] bg-[#20211F] px-3.5 text-xs font-semibold text-white shadow-none hover:bg-[#343633] focus-visible:border-[#72CF35] focus-visible:ring-[#72CF35]/30 [&_svg]:!size-[17px] [&_svg]:!text-white [&_svg]:!opacity-100"><SelectValue /></SelectTrigger><SelectContent position="popper" align="end" className="min-w-[132px] rounded-[16px] border-[#E7E9E4] bg-white p-1 shadow-[0_16px_40px_rgba(32,33,31,0.14)]">{rangeOptions.map((option) => <SelectItem key={option.value} value={option.value} className="min-h-10 cursor-pointer rounded-xl text-xs font-semibold text-[#343633] focus:bg-[#EFF9E8] focus:text-[#315E18]">{option.label}</SelectItem>)}</SelectContent></Select></div></div>
              {chart && chart.selectedRange !== chart.displayedRange ? <p role="status" className="mt-1 text-xs text-[#696C67]">Showing {rangeOptions.find((option) => option.value === chart.displayedRange)?.label} while {rangeOptions.find((option) => option.value === chart.selectedRange)?.label} loads.</p> : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-medium text-[#696C67] sm:text-xs"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#72CF35]" />Revenue</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#FF5B61]" />Expenses</span><span className="flex items-center gap-1.5"><i className="h-px w-3.5 bg-[#20211F]" />Cashflow</span></div>
              {financialData.length ? <><div className="-mx-2 mt-2 min-w-0 overflow-hidden pb-1 sm:mx-0"><FinancialChart range={range} data={financialData} /></div>
              <table className="sr-only"><caption>Financial data for the selected range</caption><thead><tr><th>Period</th><th>Revenue</th><th>Expenses</th><th>Cashflow</th></tr></thead><tbody>{financialData.map((row) => <tr key={row.period}><th>{row.period}</th><td>{row.revenue}</td><td>{row.expenses}</td><td>{row.cashflow}</td></tr>)}</tbody></table></> : <DashboardEmptyState title="Financial data unavailable" description="No financial activity is available for the selected range." className="mt-5 h-[240px] sm:h-[340px] lg:h-[440px]" />}
            </section>
            <TodaysBookingsPanel businessSlug={businessSlug} bookings={dashboardData.bookings} refresh={refresh?.today} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="min-h-0 xl:col-span-4"><PreviewLiveQueue queue={dashboardData.queue} refresh={refresh?.queue} onVisibilityChange={onQueueVisibilityChange} onAction={onQueueAction} /></div>
            <div className="grid content-start gap-5 xl:col-span-8">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(260px,3fr)]">
                <RankedPanel title="Expense breakdown" subtitle="Where this month’s operating budget went" items={dashboardData.expenseBreakdown} emptyMessage="Recorded operating expenses will appear here." tone="coral" action={<PreviewExpenseDialog onSubmitExpense={onExpenseSubmit} pending={expenseFeedback?.pending ?? false} />} notice={expenseFeedback?.error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF0F0] px-3 py-2 text-xs font-medium text-[#A12F37]">{expenseFeedback.error}</p> : expenseFeedback?.status ? <p role="status" className="sr-only">{expenseFeedback.status}</p> : null} separateExpense={expenseFeedback?.separate} />
                <PreviewGrowthOpportunity businessSlug={businessSlug} growth={dashboardData.growth} occupancyAvailability={dashboardData.availability.growthOccupancy} refresh={refresh?.growth} />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <RankedPanel title="Top services" subtitle="Highest revenue services this month" items={dashboardData.topServices} emptyMessage="Service rankings will appear after revenue is recorded." tone="ink" />
                <RankedPanel title="Top customers" subtitle="Highest customer value this month" items={dashboardData.topCustomers} emptyMessage="Customer rankings will appear after completed visits." />
              </div>
            </div>

            <section className="rounded-[30px] border border-white bg-white p-5 shadow-[0_18px_45px_rgba(32,33,31,0.045)] xl:col-span-12" aria-labelledby="staff-heading">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 id="staff-heading" className="text-base font-bold tracking-tight">Staff performance</h2><p className="mt-0.5 text-xs text-[#696C67]">Revenue and schedule utilization</p></div>
                <p className="text-[10px] font-medium text-[#92958F]">This month · {dashboardData.staff.reduce((total, person) => total + person.bookings, 0)} bookings</p>
              </div>
              {dashboardData.staff.length ? <div className="grid gap-2.5 lg:grid-cols-3">
                {dashboardData.staff.map((person) => {
                  const utilizationUnavailable = dashboardData.availability.staffUtilization === "unavailable" || person.utilization === null;
                  return (
                  <article key={person.id} className="rounded-[18px] bg-[#F7F8F5] px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#E8EAE4] font-mono text-[10px] font-bold text-[#555852]">{person.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold leading-tight">{person.name}</p><p className="mt-0.5 truncate text-[10px] text-[#81847E]">{person.role} · {person.bookings} bookings</p></div>
                      <div className="shrink-0 text-right"><p className="font-mono text-sm font-bold leading-none">{compactNumber(person.revenue)}</p><p className={cn("mt-1 text-[9px] font-semibold", utilizationUnavailable ? "text-[#81847E]" : "font-mono text-[#4D8F24]")}>{utilizationUnavailable ? "Utilization unavailable" : `${person.utilization}% utilized`}</p></div>
                    </div>
                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white">{utilizationUnavailable ? null : <div className="h-full rounded-full bg-[#72CF35]" style={{ width: `${person.utilization}%` }} />}</div>
                  </article>
                );})}
              </div> : <DashboardEmptyState title="No staff performance data" description="Staff performance will appear after bookings are completed." />}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
