import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerGiftCardsRedesign from "@/components/dashboard/design-study/OwnerGiftCardsRedesign";

export const metadata: Metadata = {
  title: { absolute: "Gift Cards — HANAYIN" },
  description: "Manage gift cards, recipients, included experiences, and claims.",
  robots: { index: false, follow: false },
};

export default function GiftCardsPage() {
  return <OwnerGiftCardsRedesign fontClassName={redesignBodyFont.variable} />;
}
