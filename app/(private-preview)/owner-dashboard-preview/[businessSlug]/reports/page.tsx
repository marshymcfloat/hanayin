import { Suspense } from "react";
import { OwnerReportsPreview } from "@/components/dashboard/owner-preview/OwnerReportsPreview";
import { OwnerPreviewContentSkeleton } from "@/components/dashboard/owner-preview/OwnerPreviewContentSkeleton";

export const metadata = { title: "Reports Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function ReportsPreviewPage() {
  return <Suspense fallback={<OwnerPreviewContentSkeleton />}><OwnerReportsPreview /></Suspense>;
}
