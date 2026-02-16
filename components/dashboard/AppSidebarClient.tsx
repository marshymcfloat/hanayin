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
  SidebarGroupLabel,
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
  iconColor: string;
  activeColor: string;
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
  user: {
    name: string;
    email: string;
    role: string;
  };
};

export function AppSidebarClient({ businessSlug, entitlements, user }: SidebarProps) {
  const pathname = usePathname();
  const slug = businessSlug || "demo";

  const dashboardItem: NavItem = {
    title: "Dashboard",
    url: `/app/${slug}`,
    icon: Home,
  };

  const businessItems: NavItem[] = [
    { title: "Services", url: `/app/${slug}/services`, icon: Box },
    { title: "Packages", url: `/app/${slug}/packages`, icon: Package },
    { title: "Vouchers", url: `/app/${slug}/vouchers`, icon: Ticket },
    {
      title: "Gift Cards",
      url: `/app/${slug}/gift-cards`,
      icon: Gift,
    },
    {
      title: "Sale Events",
      url: `/app/${slug}/sale-events`,
      icon: Percent,
    },
    ...(entitlements.social
      ? ([
          {
            title: "Social Posts",
            url: `/app/${slug}/social-posts`,
            icon: Megaphone,
          },
        ] satisfies NavItem[])
      : []),
    {
      title: "Business Hours",
      url: `/app/${slug}/business-hours`,
      icon: Calendar,
    },
    {
      title: "Billing",
      url: `/app/${slug}/billing`,
      icon: CreditCard,
    },
    ...(entitlements.reportsCore
      ? ([
          {
            title: "Reports",
            url: `/app/${slug}/reports`,
            icon: BarChart3,
          },
        ] satisfies NavItem[])
      : []),
  ];

  const navGroups: NavGroup[] = [
    {
      title: "Business",
      icon: Package,
      iconColor: "text-violet-600 dark:text-violet-400",
      activeColor: "bg-violet-100 dark:bg-violet-500/20",
      items: businessItems,
    },
    {
      title: "Team",
      icon: Users,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      activeColor: "bg-emerald-100 dark:bg-emerald-500/20",
      items: [
        { title: "Employees", url: `/app/${slug}/employees`, icon: UserCircle },
        { title: "Owners", url: `/app/${slug}/owners`, icon: Crown },
        {
          title: "Attendance",
          url: `/app/${slug}/attendance`,
          icon: ClipboardList,
        },
        { title: "Payroll", url: `/app/${slug}/payroll`, icon: Wallet },
      ],
    },
    {
      title: "Customers",
      icon: Calendar,
      iconColor: "text-amber-600 dark:text-amber-400",
      activeColor: "bg-amber-100 dark:bg-amber-500/20",
      items: [
        { title: "Customers", url: `/app/${slug}/customers`, icon: Users },
        { title: "Bookings", url: `/app/${slug}/bookings`, icon: Calendar },
      ],
    },
  ];

  const settingsItem: NavItem = {
    title: "Settings",
    url: `/app/${slug}/business`,
    icon: Settings,
  };

  const isActive = (url: string) => {
    if (url === `/app/${slug}`) return pathname === url;
    return pathname.startsWith(url);
  };

  const isGroupActive = (items: NavItem[]) =>
    items.some((item) => isActive(item.url));

  return (
    <Sidebar className="overflow-x-hidden z-30">
      <SidebarHeader className="border-b border-border/40 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-base font-bold tracking-tight truncate">
              ServiceFlow
            </span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
              Pro Dashboard
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup className="px-3 py-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive(dashboardItem.url)}
                size="lg"
                className={cn(
                  "relative rounded-xl transition-all duration-200",
                  isActive(dashboardItem.url)
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-muted",
                )}
              >
                <Link href={dashboardItem.url}>
                  {isActive(dashboardItem.url) && (
                    <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <dashboardItem.icon
                    className={cn(
                      "h-5 w-5",
                      isActive(dashboardItem.url) && "text-primary",
                    )}
                  />
                  <span>{dashboardItem.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <div className="flex flex-col gap-1 px-3">
          {navGroups.map((group) => (
            <Collapsible
              key={group.title}
              defaultOpen={isGroupActive(group.items)}
              className="group/collapsible"
            >
              <SidebarGroup className="p-0">
                <SidebarGroupLabel asChild className="p-0 h-auto">
                  <CollapsibleTrigger
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                      "hover:bg-muted/80 cursor-pointer",
                      "[&[data-state=open]>svg.chevron]:rotate-90",
                      isGroupActive(group.items) && group.activeColor,
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60",
                        isGroupActive(group.items) &&
                          "bg-white/80 dark:bg-white/10",
                      )}
                    >
                      <group.icon className={cn("h-4 w-4", group.iconColor)} />
                    </div>
                    <span
                      className={cn(
                        "flex-1 text-left text-sm font-semibold",
                        isGroupActive(group.items)
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {group.title}
                    </span>
                    <ChevronRight className="chevron h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>

                <CollapsibleContent>
                  <SidebarGroupContent className="pt-1 pb-2">
                    <SidebarMenu className="gap-0.5 pl-12">
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive(item.url)}
                            className={cn(
                              "relative rounded-lg transition-all duration-200",
                              isActive(item.url)
                                ? "bg-muted font-medium text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                          >
                            <Link href={item.url}>
                              {isActive(item.url) && (
                                <span className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-violet-500 to-indigo-500" />
                              )}
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          ))}
        </div>

        <SidebarGroup className="mt-auto px-3 pb-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive(settingsItem.url)}
                className={cn(
                  "rounded-xl transition-all duration-200",
                  isActive(settingsItem.url)
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Link href={settingsItem.url}>
                  <settingsItem.icon className="h-4 w-4" />
                  <span>{settingsItem.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-3">
        <SidebarUserFooter user={user} businessSlug={slug} />
      </SidebarFooter>
    </Sidebar>
  );
}
