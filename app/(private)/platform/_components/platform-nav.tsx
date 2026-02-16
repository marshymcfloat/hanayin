"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Building2,
  Inbox,
  ReceiptText,
  WalletCards,
  UsersRound,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PlatformNavIcon =
  | "overview"
  | "applications"
  | "businesses"
  | "outbox"
  | "plans"
  | "invoices"
  | "referrals"
  | "audit";

export type PlatformNavItem = {
  href: string;
  label: string;
  icon: PlatformNavIcon;
};

const iconByName: Record<PlatformNavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  applications: BriefcaseBusiness,
  businesses: Building2,
  outbox: Inbox,
  plans: WalletCards,
  invoices: ReceiptText,
  referrals: UsersRound,
  audit: ShieldCheck,
};

function trimTrailingSlash(path: string) {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

export function PlatformNav({ items }: { items: PlatformNavItem[] }) {
  const pathname = trimTrailingSlash(usePathname() || "/platform");
  const isOverviewRoute =
    pathname === "/platform" || pathname === "/platform/overview";

  return (
    <nav aria-label="Platform sections" className="overflow-x-auto pb-1">
      <ul className="flex min-w-max flex-wrap gap-2">
        {items.map((item) => {
          const itemPath = trimTrailingSlash(item.href);
          const isActive =
            item.icon === "overview"
              ? isOverviewRoute
              : pathname === itemPath || pathname.startsWith(`${itemPath}/`);
          const Icon = iconByName[item.icon];

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400",
                  isActive
                    ? "bg-stone-900 text-white shadow-sm"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-stone-300" : "text-stone-400",
                  )}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
