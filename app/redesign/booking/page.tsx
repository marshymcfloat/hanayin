import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import BookingDesignExperiment from "@/components/bookings/design-study/BookingDesignExperiment";

export const metadata: Metadata = {
  title: { absolute: "Booking design study — HANAYIN" },
  description: "An experimental responsive service-selection experience.",
  robots: { index: false, follow: false },
};

export default function BookingDesignStudyPage() {
  return <BookingDesignExperiment fontClassName={redesignBodyFont.variable} />;
}
