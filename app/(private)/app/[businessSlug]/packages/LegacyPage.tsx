import { Suspense } from "react";
import { PackagesPageSkeleton } from "./PackagesPageSkeleton";
import { PackagesContent } from "./PackagesContent";

export default function PackagesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={<PackagesPageSkeleton />}>
      <PackagesContent params={params} />
    </Suspense>
  );
}
