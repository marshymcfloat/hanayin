import { Suspense } from "react";
import { ServicesPageSkeleton } from "./ServicesPageSkeleton";
import { ServicesContent } from "./ServicesContent";

export default function ServicesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={<ServicesPageSkeleton />}>
      <ServicesContent params={params} />
    </Suspense>
  );
}
