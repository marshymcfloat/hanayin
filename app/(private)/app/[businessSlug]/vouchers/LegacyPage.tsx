import { Suspense } from "react";
import { VouchersPageSkeleton } from "./VouchersPageSkeleton";
import { VouchersContent } from "./VouchersContent";

interface PageProps {
  params: Promise<{
    businessSlug: string;
  }>;
}

export default function VouchersPage({ params }: PageProps) {
  return (
    <Suspense fallback={<VouchersPageSkeleton />}>
      <VouchersContent params={params} />
    </Suspense>
  );
}
