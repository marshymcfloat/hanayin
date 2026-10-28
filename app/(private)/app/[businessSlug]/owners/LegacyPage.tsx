import { Suspense } from "react";
import { OwnersPageSkeleton } from "./OwnersPageSkeleton";
import { OwnersContent } from "./OwnersContent";

export default function OwnersPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={<OwnersPageSkeleton />}>
      <OwnersContent params={params} />
    </Suspense>
  );
}
