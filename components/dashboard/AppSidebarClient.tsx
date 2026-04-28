"use client";

import {
  Home,
  Settings,
  Package,
  Box,
  Ticket,
  Gift,
  Users,
  ClipboardList,
  Wallet,
  UserCircle,
  Calendar,
  ChevronRight,
  Sparkles,
  Percent,
  Megaphone,
  Crown,
  CreditCard,
  BarChart3,
  TrendingUp,
  Bell,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SidebarUserFooter } from "./SidebarUserFooter";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

type NavGroup = {
  title: string;
  icon: LucideIcon;
  items: NavItem[];
};

type SidebarProps = {
  businessSlug: string;
  entitlements: {
    website: boolean;
    growth: boolean;
    social: boolean;
    ai: boolean;
    reportsCore: boolean;
    reportsAdvanced: boolean;
  };
  capabilities: {
    isOwner: boolean;
    canManageCatalog: boolean;
    canQueueOverride: boolean;
  };
  user: {
    name: string;
    email: string;
    role: string;
  };
};

export function AppSidebarClient({
  businessSlug,
  entitlements,
  capabilities,
  user,
}: SidebarProps) {
  const pathname = usePathname();
  const slug = businessSlug || "demo";
  const isOwner = capabilities.isOwner;

  const dashboardItem: NavItem = {
    title: "Dashboard",
    url: `/app/${slug}`,
    icon: Home,
  };

  const ownerBusinessItems: NavItem[] = [
    { title: "Services", url: `/app/${slug}/services`, icon: Box },
    { title: "Packages", url: `/app/${slug}/packages`, icon: Package },
    { title: "Vouchers", url: `/app/${slug}/vouchers`, icon: Ticket },
    { title: "Gift Cards", url: `/app/${slug}/gift-cards`, icon: Gift },
    { title: "Sale Events", url: `/app/${slug}/sale-events`, icon: Percent },
    ...(entitlements.social
      ? ([{ title: "Social Posts", url: `/app/${slug}/social-posts`, icon: Megaphone }] satisfies NavItem[])
      : []),
    ...(entitlements.growth
      ? ([{ title: "Growth", url: `/app/${slug}/growth`, icon: TrendingUp }] satisfies NavItem[])
      : []),
    { title: "Business Hours", url: `/app/${slug}/business-hours`, icon: Calendar },
    { title: "Billing", url: `/app/${slug}/billing`, icon: CreditCard },
    ...(entitlements.reportsCore
      ? ([{ title: "Reports", url: `/app/${slug}/reports`, icon: BarChart3 }] satisfies NavItem[])
      : []),
  ];

  const managerBusinessItems: NavItem[] = [
    { title: "Services", url: `/app/${slug}/services`, icon: Box },
    { title: "Packages", url: `/app/${slug}/packages`, icon: Package },
    ...(entitlements.reportsCore
      ? ([{ title: "Reports", url: `/app/${slug}/reports`, icon: BarChart3 }] satisfies NavItem[])
      : []),
  ];

  const navGroups: NavGroup[] = [
    {
      title: "Business",
      icon: Package,
      items: isOwner ? ownerBusinessItems : managerBusinessItems,
    },
    ...(isOwner
      ? ([{
          title: "Team",
          icon: Users,
          items: [
            { title: "Employees", url: `/app/${slug}/employees`, icon: UserCircle },
            { title: "Owners", url: `/app/${slug}/owners`, icon: Crown },
            { title: "Attendance", url: `/app/${slug}/attendance`, icon: ClipboardList },
            { title: "Payroll", url: `/app/${slug}/payroll`, icon: Wallet },
          ],
        }] satisfies NavGroup[])
      : []),
    {
      title: "Customers",
      icon: Calendar,
      items: isOwner
        ? [
            { title: "Customers", url: `/app/${slug}/customers`, icon: Users },
            { title: "Bookings", url: `/app/${slug}/bookings`, icon: Calendar },
            { title: "Notifications", url: `/app/${slug}/notifications`, icon: Bell },
          ]
        : [
            { title: "Bookings", url: `/app/${slug}/bookings`, icon: Calendar },
          ],
    },
  ];

  const settingsItem: NavItem | null = isOwner
    ? { title: "Settings", url: `/app/${slug}/business`, icon: Settings }
    : null;

  const isActive = (url: string) => {
    if (url === `/app/${slug}`) return pathname === url;
    return pathname.startsWith(url);
  };

  const isGroupActive = (items: NavItem[]) =>
    items.some((item) => isActive(item.url));

  return (
    <Sidebar className="overflow-x-hidden z-30 border-r border-sidebar-border">

      {/* ── Logo ──────────────────────────────────── */}
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/30">
            <Sparkles className="h-[18px] w-[18px] text-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground leading-none truncate">
              ServiceFlow
            </span>
            <span className="text-[9px] text-sidebar-primary font-semibold uppercase tracking-[0.18em] mt-0.5">
              Pro Dashboard
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden py-3 gap-0">

        {/* ── Dashboard ─────────────────────────── */}
        <div className="px-3 pb-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive(dashboardItem.url)}
                className={cn(
                  "relative h-9 rounded-xl px-3 transition-all duration-200 cursor-pointer",
                  isActive(dashboardItem.url)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Link href={dashboardItem.url}>
                  {isActive(dashboardItem.url) && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                  )}
                  <dashboardItem.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive(dashboardItem.url)
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/45",
                    )}
                  />
                  <span className="text-[13px]">{dashboardItem.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>

        {/* ── Collapsible nav groups ─────────────── */}
        <div className="flex flex-col px-3 gap-0.5">
          {navGroups.map((group) => {
            const groupActive = isGroupActive(group.items);
            return (
              <Collapsible
                key={group.title}
                defaultOpen={groupActive}
                className="group/collapsible"
              >
                <SidebarGroup className="p-0">

                  {/* Group trigger */}
                  <CollapsibleTrigger
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-250 cursor-pointer",
                      "[&[data-state=open]_.chevron]:rotate-90",
                      groupActive
                        ? "text-sidebar-foreground hover:bg-sidebar-accent/60"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80",
                    )}
                  >
                    {/* Group icon */}
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                        groupActive
                          ? "bg-sidebar-primary/15 text-sidebar-primary"
                          : "bg-sidebar-foreground/8 text-sidebar-foreground/35",
                      )}
                    >
                      <group.icon className="h-3.5 w-3.5" />
                    </div>

                    <span className="flex-1 text-left text-[11px] font-semibold uppercase tracking-widest">
                      {group.title}
                    </span>

                    <ChevronRight
                      className="chevron h-3 w-3 shrink-0 text-sidebar-foreground/25 transition-transform duration-250"
                    />
                  </CollapsibleTrigger>

                  {/* Sub-items */}
                  <CollapsibleContent>
                    <SidebarGroupContent className="pb-1.5">
                      {/* Connector line + items */}
                      <div className="relative ml-[22px] pl-4 border-l border-sidebar-border">
                        <SidebarMenu className="gap-px">
                          {group.items.map((item) => (
                            <SidebarMenuItem key={item.title}>
                              <SidebarMenuButton
                                asChild
                                isActive={isActive(item.url)}
                                className={cn(
                                  "relative h-8 rounded-xl px-3 transition-all duration-200 cursor-pointer",
                                  isActive(item.url)
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                                    : "text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                                )}
                              >
                                <Link href={item.url}>
                                  {isActive(item.url) && (
                                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                                  )}
                                  <item.icon
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0",
                                      isActive(item.url)
                                        ? "text-sidebar-primary"
                                        : "text-sidebar-foreground/35",
                                    )}
                                  />
                                  <span className="text-[13px]">{item.title}</span>
                                </Link>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </div>
                    </SidebarGroupContent>
                  </CollapsibleContent>

                </SidebarGroup>
              </Collapsible>
            );
          })}
        </div>

        {/* ── Settings ──────────────────────────── */}
        {settingsItem ? (
          <SidebarGroup className="mt-auto px-3 pt-2">
            <div className="h-px bg-sidebar-border mb-2" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(settingsItem.url)}
                  className={cn(
                    "relative h-9 rounded-xl px-3 transition-all duration-200 cursor-pointer",
                    isActive(settingsItem.url)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                      : "text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Link href={settingsItem.url}>
                    {isActive(settingsItem.url) && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                    )}
                    <settingsItem.icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive(settingsItem.url)
                          ? "text-sidebar-primary"
                          : "text-sidebar-foreground/35",
                      )}
                    />
                    <span className="text-[13px]">{settingsItem.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarUserFooter user={user} businessSlug={slug} />
      </SidebarFooter>
    </Sidebar>
  );
}
