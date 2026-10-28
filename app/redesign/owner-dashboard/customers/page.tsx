import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerCustomersPreviewRoute } from "@/components/dashboard/owner-preview/OwnerCustomersPreview";

export const metadata: Metadata = { title: { absolute: "Customers — HANAYIN" }, description: "Customer contacts and completed service history.", robots: { index: false, follow: false } };
export default function CustomersPage() {
  return <OwnerCustomerWorkspace page="customers" fontClassName={redesignBodyFont.variable}><OwnerCustomersPreviewRoute redesign fontClassName={redesignBodyFont.variable} /></OwnerCustomerWorkspace>;
}
