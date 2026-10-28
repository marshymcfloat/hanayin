"use client";

import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createBooking } from "@/features/bookings/actions/booking";
import { invalidateOwnerBookingViews } from "./owner-booking-invalidation";
import { useOwnerPreviewContext } from "./OwnerPreviewQueryProvider";
import { OwnerPreviewBookingQuickPanel } from "@/components/dashboard/owner-preview/OwnerPreviewBookingQuickPanel";

type OwnerBookingPayload = Parameters<typeof createBooking>[0];

type OwnerBookingControllerValue = {
  openBooking: (focusKey?: string) => void;
  pending: boolean;
  recoveryAvailable: boolean;
};

const OwnerBookingContext = createContext<OwnerBookingControllerValue | null>(null);

export function useOwnerBookingController() {
  const value = useContext(OwnerBookingContext);
  if (!value) throw new Error("Owner booking controller is unavailable");
  return value;
}

function failureDescription(code: string) {
  switch (code) {
    case "SLOT_JUST_TAKEN":
    case "NO_CAPACITY_FOR_SELECTED_SERVICES":
    case "WALK_IN_CAPACITY_EXCEEDED":
      return "The selected time is unavailable. Reopen the draft and choose another time.";
    case "SALE_SLOT_LIMIT_REACHED":
      return "The promotion is full. Reopen the draft to review the price and services.";
    case "QUOTE_CHANGED":
      return "Prices or offer availability changed. Reopen the draft, review the refreshed total, and confirm again.";
    default:
      return "Check the Bookings list before trying again. Your draft is available to reopen.";
  }
}

export function OwnerBookingControllerProvider({ children, bookingDesign = "owner", bookingFontClassName = "" }: { children: ReactNode; bookingDesign?: "owner" | "redesign"; bookingFontClassName?: string }) {
  const identity = useOwnerPreviewContext();
  const identityKey = `${identity.userId}:${identity.businessId}:${identity.businessSlug}`;
  const identityKeyRef = useRef(identityKey);
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [open, setOpen] = useState(false);
  const [openedPathname, setOpenedPathname] = useState(pathname);
  const openRef = useRef(false);
  const previousPathRef = useRef(pathname);
  const [session, setSession] = useState(0);
  const [focusKey, setFocusKey] = useState("owner-new-booking");
  const [pending, setPending] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const recoveryRef = useRef(false);
  const pendingRef = useRef(false);
  const generationRef = useRef(0);
  const requestGenerationRef = useRef(0);
  const aliveRef = useRef(true);

  useLayoutEffect(() => {
    identityKeyRef.current = identityKey;
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      generationRef.current += 1;
      requestGenerationRef.current += 1;
      pendingRef.current = false;
      recoveryRef.current = false;
      openRef.current = false;
    };
  }, [identityKey]);

  useLayoutEffect(() => {
    pathnameRef.current = pathname;
    if (previousPathRef.current !== pathname) {
      previousPathRef.current = pathname;
      openRef.current = false;
      queueMicrotask(() => {
        if (!openRef.current) setOpen(false);
      });
    }
  }, [pathname]);

  useEffect(() => {
    const closeOnRestore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        openRef.current = false;
        setOpen(false);
      }
    };
    window.addEventListener("pageshow", closeOnRestore);
    return () => window.removeEventListener("pageshow", closeOnRestore);
  }, []);

  const changeOpen = useCallback((next: boolean) => {
    openRef.current = next;
    if (next) setOpenedPathname(pathnameRef.current);
    setOpen(next);
  }, []);

  const openBooking = useCallback((requestedFocusKey = "owner-new-booking") => {
    if (pendingRef.current) return;
    setFocusKey(requestedFocusKey);
    if (!recoveryAvailable) setSession((current) => current + 1);
    changeOpen(true);
  }, [changeOpen, recoveryAvailable]);

  const submitBooking = useCallback((payload: OwnerBookingPayload) => {
    if (!aliveRef.current || identityKeyRef.current !== identityKey || pendingRef.current || !openRef.current || payload.businessSlug !== identity.businessSlug) return;
    pendingRef.current = true;
    const generation = generationRef.current;
    const requestGeneration = ++requestGenerationRef.current;
    const submittedIdentityKey = identityKey;
    setPending(true);
    changeOpen(false);

    const isCurrent = () => aliveRef.current &&
      generationRef.current === generation &&
      requestGenerationRef.current === requestGeneration &&
      identityKeyRef.current === submittedIdentityKey;

    void createBooking(payload)
      .then((result) => {
        if (!isCurrent()) return;
        if (result.type !== "internal") {
          throw new Error(result.type === "error" ? result.code : "BOOKING_FAILED");
        }
        pendingRef.current = false;
        setPending(false);
        recoveryRef.current = false;
        setRecoveryAvailable(false);
        setSession((current) => current + 1);
        invalidateOwnerBookingViews(queryClient, identity);
        toast.success("Booking successfully created");
        result.warnings?.forEach((warning) => toast.message(warning));
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        pendingRef.current = false;
        setPending(false);
        recoveryRef.current = true;
        setRecoveryAvailable(true);
        const code = error instanceof Error ? error.message : "BOOKING_FAILED";
        toast.error("Could not confirm booking", {
          description: failureDescription(code),
          action: {
            label: "Reopen booking",
            onClick: () => {
              if (isCurrent() && recoveryRef.current && !pendingRef.current) changeOpen(true);
            },
          },
        });
      });
  }, [changeOpen, identity, identityKey, queryClient]);

  return (
    <OwnerBookingContext.Provider value={{ openBooking, pending, recoveryAvailable }}>
      {children}
      {session > 0 ? (
        <OwnerPreviewBookingQuickPanel
          bookingDesign={bookingDesign}
          fontClassName={bookingFontClassName}
          businessSlug={identity.businessSlug}
          open={open && openedPathname === pathname}
          onOpenChange={changeOpen}
          bookingSession={session}
          restoreFocusKey={focusKey}
          onOwnerSubmit={submitBooking}
          ownerSubmissionPending={pending}
          preserveDraft={pending || recoveryAvailable}
        />
      ) : null}
    </OwnerBookingContext.Provider>
  );
}
