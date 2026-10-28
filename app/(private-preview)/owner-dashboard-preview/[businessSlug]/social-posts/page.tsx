import { Suspense } from "react";
import { OwnerSocialPostsPreviewQuery } from "@/components/dashboard/owner-preview/OwnerSocialPostsPreviewQuery";
import { OwnerCatalogPreviewSkeleton } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewSkeleton";

export const metadata = {
  title: "Social Posts Preview | ServiceFlow",
  robots: { index: false, follow: false },
};

export default function SocialPostsPreviewPage() {
  return (
    <Suspense
      fallback={<OwnerCatalogPreviewSkeleton label="social posts preview" />}
    >
      <OwnerSocialPostsPreviewQuery />
    </Suspense>
  );
}
