import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerRedesignQuery from "@/components/dashboard/design-study/OwnerRedesignQuery";

export const metadata: Metadata = {
  title: { absolute: "Owner dashboard — HANAYIN" },
  description: "Your business, bookings, and team at a glance.",
  robots: { index: false, follow: false },
};

export default function OwnerDashboardStudyPage() {
  return <OwnerRedesignQuery fontClassName={redesignBodyFont.variable} />;
}
