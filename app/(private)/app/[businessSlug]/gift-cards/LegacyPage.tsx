import { Suspense } from "react";

import { GiftCardsContent } from "./GiftCardsContent";
import { GiftCardsPageSkeleton } from "./GiftCardsPageSkeleton";

interface PageProps {
  params: Promise<{
    businessSlug: string;
  }>;
}

export default function GiftCardsPage({ params }: PageProps) {
  return (
    <Suspense fallback={<GiftCardsPageSkeleton />}>
      <GiftCardsContent params={params} />
    </Suspense>
  );
}
