import { Suspense } from "react";
import { OwnerSaleEventsPreviewQuery } from "@/components/dashboard/owner-preview/OwnerSaleEventsPreviewQuery";
import { OwnerCatalogPreviewSkeleton } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewSkeleton";

export const metadata = { title: "Sale Events Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function SaleEventsPreviewPage() {
  return <Suspense fallback={<OwnerCatalogPreviewSkeleton label="sale events preview" />}><OwnerSaleEventsPreviewQuery /></Suspense>;
}
