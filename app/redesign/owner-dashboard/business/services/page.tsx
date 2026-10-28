import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerServicesRedesign from "@/components/dashboard/design-study/OwnerServicesRedesign";

export const metadata: Metadata = {
  title: { absolute: "Services — HANAYIN" },
  description: "Manage your service catalog, pricing, and treatment details.",
  robots: { index: false, follow: false },
};

export default function ServicesPage() {
  return <OwnerServicesRedesign fontClassName={redesignBodyFont.variable} />;
}
