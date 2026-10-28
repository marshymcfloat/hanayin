import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerPackagesRedesign from "@/components/dashboard/design-study/OwnerPackagesRedesign";

export const metadata: Metadata = {
  title: { absolute: "Packages — HANAYIN" },
  description: "Manage your packages, included services, and pricing.",
  robots: { index: false, follow: false },
};

export default function PackagesPage() {
  return <OwnerPackagesRedesign fontClassName={redesignBodyFont.variable} />;
}
