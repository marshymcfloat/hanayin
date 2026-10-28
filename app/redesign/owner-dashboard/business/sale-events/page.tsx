import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerSaleEventsRedesign from "@/components/dashboard/design-study/OwnerSaleEventsRedesign";

export const metadata: Metadata = {
  title: { absolute: "Sale Events — HANAYIN" },
  description: "Manage your offers, schedules, discounts, and promotion.",
  robots: { index: false, follow: false },
};

export default function SaleEventsPage() {
  return <OwnerSaleEventsRedesign fontClassName={redesignBodyFont.variable} />;
}
