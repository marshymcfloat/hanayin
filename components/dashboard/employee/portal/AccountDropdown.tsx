"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Calendar as CalendarIcon,
  LogOut,
  MessageSquarePlus,
  User as UserIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * AccountDropdown — the avatar trigger + menu in the top-right
 * of the employee portal. Pulled out of EmployeeDashboard so the
 * same dropdown can drop into ManagerDashboard or any future
 * non-owner shell without copy-paste drift.
 *
 * Items:
 *   - "All bookings" — always shown for employees
 *   - "My post requests" — gated by `canSubmitSocialPost`
 *   - "Log out"
 */
export interface AccountDropdownProps {
  businessSlug: string;
  canSubmitSocialPost: boolean;
}

export function AccountDropdown({
  businessSlug,
  canSubmitSocialPost,
}: AccountDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full p-0 hover:bg-primary/[0.06] focus-visible:ring-primary/30"
          aria-label="Account menu"
        >
          <Avatar className="size-10 ring-1 ring-inset ring-black/[0.06]">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <UserIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56 rounded-2xl p-1.5"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          My account
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-lg">
          <Link href={`/app/${businessSlug}/bookings`}>
            <CalendarIcon className="mr-2 size-4" />
            All bookings
          </Link>
        </DropdownMenuItem>
        {canSubmitSocialPost ? (
          <DropdownMenuItem asChild className="cursor-pointer rounded-lg">
            <Link href={`/app/${businessSlug}/social-posts/my-requests`}>
              <MessageSquarePlus className="mr-2 size-4" />
              My post requests
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/" })}
          className="cursor-pointer rounded-lg text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
