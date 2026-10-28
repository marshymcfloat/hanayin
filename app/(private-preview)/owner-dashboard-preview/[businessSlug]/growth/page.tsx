import { Suspense } from "react";
import { OwnerGrowthPreview } from "@/components/dashboard/owner-preview/OwnerGrowthPreview";
import { OwnerPreviewContentSkeleton } from "@/components/dashboard/owner-preview/OwnerPreviewContentSkeleton";

export const metadata = { title: "Growth Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function GrowthPreviewPage() {
  return <Suspense fallback={<OwnerPreviewContentSkeleton />}><OwnerGrowthPreview /></Suspense>;
}
