import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerBusinessWorkspace from "@/components/dashboard/design-study/OwnerBusinessWorkspace";

export const metadata: Metadata = {
  title: { absolute: "Billing — HANAYIN" },
  description: "Manage your subscription, invoices, and payment references.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <OwnerBusinessWorkspace page="billing" fontClassName={redesignBodyFont.variable} />;
}
