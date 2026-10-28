import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerBusinessWorkspace from "@/components/dashboard/design-study/OwnerBusinessWorkspace";

export const metadata: Metadata = {
  title: { absolute: "Reports — HANAYIN" },
  description: "Explore your business performance and reporting.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <OwnerBusinessWorkspace page="reports" fontClassName={redesignBodyFont.variable} />;
}
