import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerBusinessWorkspace from "@/components/dashboard/design-study/OwnerBusinessWorkspace";

export const metadata: Metadata = {
  title: { absolute: "Business Hours — HANAYIN" },
  description: "Set your weekly business availability.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <OwnerBusinessWorkspace page="business-hours" fontClassName={redesignBodyFont.variable} />;
}
