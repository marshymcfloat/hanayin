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
import staffTheme from "../StaffWorkspaceTheme.module.css";

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
          className="size-11 rounded-full border border-[#E7E9E4] bg-white p-0 text-[#20211F] hover:bg-[#EFF9E8] focus-visible:ring-[#72CF35]"
          aria-label="Account menu"
        >
          <Avatar className="size-10">
            <AvatarFallback className="bg-[#20211F] text-white">
              <UserIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={`${staffTheme.workspace} w-56 rounded-2xl border-[#E7E9E4] bg-white p-1.5 text-[#20211F] shadow-[0_18px_45px_rgba(32,33,31,0.15)]`}
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#696C67]">
          My account
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11 cursor-pointer rounded-lg focus:bg-[#EFF9E8]">
          <Link href={`/app/${businessSlug}/bookings`}>
            <CalendarIcon className="mr-2 size-4" />
            All bookings
          </Link>
        </DropdownMenuItem>
        {canSubmitSocialPost ? (
            <DropdownMenuItem asChild className="min-h-11 cursor-pointer rounded-lg focus:bg-[#EFF9E8]">
            <Link href={`/app/${businessSlug}/social-posts/my-requests`}>
              <MessageSquarePlus className="mr-2 size-4" />
              My post requests
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/" })}
          className="min-h-11 cursor-pointer rounded-lg text-[#C74248] focus:bg-[#FFF0F0] focus:text-[#C74248]"
        >
          <LogOut className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
