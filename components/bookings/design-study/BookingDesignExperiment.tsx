"use client";

import { useState } from "react";
import { CatalogEditorBody, CatalogEditorOverlay } from "@/components/dashboard/owner-preview/CatalogEditorOverlay";
import { BookingDesignForm, BookingProgress, type BookingDesignTreatment } from "@/components/bookings/design-study/BookingSelectionSurface";
import styles from "@/components/bookings/design-study/booking-design-experiment.module.css";

// Public design fixtures only. Never load tenant records into this route.
const treatments: readonly BookingDesignTreatment[] = [
  { id: "gel-manicure", name: "Gel manicure", category: "Nails", description: "A glossy finish, made to last.", price: 280, minutes: 60, kind: "service" },
  { id: "gel-pedicure", name: "Gel pedicure", category: "Nails", description: "Fresh colour. A little extra care.", price: 300, minutes: 60, kind: "service" },
  { id: "soft-gel", name: "Soft gel extensions", category: "Nails", description: "Lightweight length, shaped your way.", price: 699, minutes: 120, kind: "service" },
  { id: "brow-lamination", name: "Brow lamination", category: "Brows & lashes", description: "Softly lifted, naturally defined.", price: 400, minutes: 60, kind: "service" },
  { id: "classic-lashes", name: "Classic lash extensions", category: "Brows & lashes", description: "An effortless, everyday flutter.", price: 450, minutes: 90, kind: "service" },
  { id: "foot-spa", name: "Foot spa", category: "Spa & body", description: "A soothing reset for tired feet.", price: 250, minutes: 45, kind: "service" },
  { id: "relaxing-massage", name: "Relaxing body massage", category: "Spa & body", description: "Slow down and soften the day.", price: 650, minutes: 60, kind: "service" },
  { id: "signature-facial", name: "Signature facial", category: "Skin", description: "Cleanse, replenish, and glow.", price: 850, minutes: 75, kind: "service" },
  { id: "nail-duo", name: "The nail care duo", category: "Nails", description: "Gel manicure + gel pedicure.", price: 550, minutes: 120, kind: "package" },
  { id: "slow-down", name: "The slow-down ritual", category: "Spa & body", description: "Foot spa + relaxing body massage.", price: 850, minutes: 105, kind: "package" },
];
const categories = ["All services", "Nails", "Brows & lashes", "Spa & body", "Skin"];

export default function BookingDesignExperiment({ fontClassName = "" }: { fontClassName?: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main>
      <div inert={sheetOpen} aria-hidden={sheetOpen || undefined}>
        <BookingDesignForm treatments={treatments} categories={categories} fontClassName={fontClassName} onOpenSheet={() => setSheetOpen(true)} />
      </div>
      <CatalogEditorOverlay
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="New booking"
        description="Choose services, then arrange the appointment."
        restoreFocusKey="booking-design-sheet"
        size="booking"
        initialFocus="panel"
        className={`${fontClassName} ${styles.sheetPanel}`}
      >
        <div className={styles.floatingProgress}><BookingProgress /></div>
        <CatalogEditorBody className={`p-0 md:px-0 ${styles.sheetBody}`}>
          <BookingDesignForm treatments={treatments} categories={categories} fontClassName={fontClassName} presentation="sheet" />
        </CatalogEditorBody>
      </CatalogEditorOverlay>
    </main>
  );
}
