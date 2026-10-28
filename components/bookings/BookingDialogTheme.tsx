"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useStaffDialogTheme } from "@/components/dashboard/employee/useStaffDialogTheme";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import styles from "@/components/dashboard/design-study/owner-bookings.module.css";

export const BookingDialogTheme = createContext("");

export function useBookingDialogTheme() {
  const theme = useContext(BookingDialogTheme);
  const staffTheme = useStaffDialogTheme();
  return theme || staffTheme;
}

export function BookingDialogScroll({ children }: { children: ReactNode }) {
  const theme = useContext(BookingDialogTheme);
  return theme ? <ScrollArea.Root type="scroll" scrollHideDelay={800} className={`relative ${styles.themeScroll}`}><ScrollArea.Viewport data-slot="scroll-area-viewport" className="h-full w-full" tabIndex={0} aria-label="Booking details">{children}</ScrollArea.Viewport><ScrollArea.Scrollbar data-slot="scroll-area-scrollbar" orientation="vertical"><ScrollArea.Thumb data-slot="scroll-area-thumb" className="relative flex-1 rounded-full" /></ScrollArea.Scrollbar></ScrollArea.Root> : <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>;
}
