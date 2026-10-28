"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OwnerBookingFormLoading } from "@/components/bookings/OwnerBookingFormLoading";
import { getOwnerBookingCatalog } from "@/features/bookings/actions/owner-booking-catalog";
import { CatalogEditorBody, CatalogEditorOverlay } from "./CatalogEditorOverlay";
import { invalidateOwnerBookingViews } from "./owner-booking-invalidation";
import { OWNER_PREVIEW_CACHE_TIME, ownerPreviewKeys, ownerPreviewStaleTime } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewRevoke } from "./OwnerPreviewQueryProvider";
import type { createBooking } from "@/features/bookings/actions/booking";
import redesignStyles from "@/components/bookings/design-study/live-booking-sheet.module.css";
import sheetStyles from "@/components/bookings/design-study/booking-design-experiment.module.css";
import { BookingProgress } from "@/components/bookings/design-study/BookingSelectionSurface";

const BookingForm = dynamic(() => import("@/components/bookings/BookingForm"), {
  ssr: false,
  loading: () => <OwnerBookingFormLoading />,
});

export function OwnerPreviewBookingQuickPanel({ businessSlug, open, onOpenChange, bookingSession, restoreFocusKey = "owner-new-booking", onOwnerSubmit, ownerSubmissionPending = false, preserveDraft = false, bookingDesign = "owner", fontClassName = "" }: {
  bookingDesign?: "owner" | "redesign";
  fontClassName?: string;
  businessSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingSession: number;
  restoreFocusKey?: string;
  onOwnerSubmit?: (payload: Parameters<typeof createBooking>[0]) => void;
  ownerSubmissionPending?: boolean;
  preserveDraft?: boolean;
}) {
  const client = useQueryClient();
  const [activeStep, setActiveStep] = useState(0);
  const identity = useOwnerPreviewContext();
  const revoke = useOwnerPreviewRevoke();
  const [formHost] = useState<HTMLDivElement | null>(() => typeof document === "undefined" ? null : document.createElement("div"));
  const [retainedSession, setRetainedSession] = useState<number | null>(null);
  const hiddenHostRef = useRef<HTMLDivElement>(null);
  const catalog = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "bookings", "create-catalog"),
    queryFn: async () => {
      const result = await getOwnerBookingCatalog(businessSlug);
      if (!result.success) {
        if (result.denied) revoke();
        throw new Error("Could not load the booking form");
      }
      return result.data;
    },
    enabled: open,
    staleTime: ownerPreviewStaleTime.catalog,
    gcTime: OWNER_PREVIEW_CACHE_TIME,
    retry: false,
  });

  if (open && retainedSession !== bookingSession) {
    setRetainedSession(bookingSession);
  }

  const attachVisibleHost = useCallback((node: HTMLDivElement | null) => {
    if (node && formHost && formHost.parentElement !== node) node.appendChild(formHost);
  }, [formHost]);

  const finishExit = () => {
    if (formHost && hiddenHostRef.current) hiddenHostRef.current.appendChild(formHost);
    if (!preserveDraft) setRetainedSession(null);
  };

  return (
    <>
    <div ref={hiddenHostRef} hidden aria-hidden="true" />
    <CatalogEditorOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="New booking"
      description={bookingDesign === "redesign" ? "Choose services, then arrange the appointment." : "Add a customer booking to your schedule."}
      restoreFocusKey={restoreFocusKey}
      size="booking"
      className={bookingDesign === "redesign" ? `${fontClassName} ${sheetStyles.sheetPanel}` : undefined}
      initialFocus={bookingDesign === "redesign" ? "panel" : "field"}
      onExited={finishExit}
    >
      {bookingDesign === "redesign" && <div className={sheetStyles.floatingProgress}><BookingProgress activeStep={activeStep} /></div>}
      <CatalogEditorBody data-business-slug={businessSlug} className={bookingDesign === "redesign" ? `p-0 md:px-0 ${sheetStyles.sheetBody} ${redesignStyles.sheetBody}` : "pb-0"}>
        {catalog.isError && (
          <div role="alert" className="mb-3 rounded-xl border border-[#E1E3DE] bg-[#FAFBF8] p-3 text-xs text-[#343633]">
            <p>{catalog.data ? "Could not refresh the catalog. Your booking draft is still available." : "Could not load the service catalog."}</p>
            <button type="button" onClick={() => void catalog.refetch()} disabled={catalog.isFetching} className="mt-2 min-h-11 rounded-full bg-[#20211F] px-4 font-semibold text-white focus-visible:ring-3 focus-visible:ring-[#72CF35] disabled:opacity-60">Try again</button>
          </div>
        )}
        <div ref={attachVisibleHost} className={bookingDesign === "redesign" ? redesignStyles.formHost : undefined} />
      </CatalogEditorBody>
    </CatalogEditorOverlay>
    {formHost && retainedSession !== null && createPortal(
      <BookingForm
        key={retainedSession}
        businessSlug={identity.businessSlug}
        bookingDesign={bookingDesign}
        onBookingStepChange={setActiveStep}
        services={catalog.data?.services ?? []}
        packages={catalog.data?.packages ?? []}
        categories={catalog.data?.categories ?? []}
        catalogPending={!catalog.data}
        isEmployee
        allowServiceClaim
        isModal
        presentation="owner"
        mobileActionBarMode="sticky"
        onOwnerSubmit={onOwnerSubmit}
        ownerSubmissionPending={ownerSubmissionPending}
        ownerFormOpen={open}
        onSuccess={() => {
          onOpenChange(false);
          invalidateOwnerBookingViews(client, identity);
        }}
      />,
      formHost,
    )}
    </>
  );
}
