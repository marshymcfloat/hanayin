import { redirect } from "next/navigation";
import { getOwnersWorkspaceData } from "@/features/businesses/queries/owners";
import { OwnersPageClient } from "./OwnersPageClient";

interface OwnersContentProps {
  params: Promise<{ businessSlug: string }>;
}

export async function OwnersContent({ params }: OwnersContentProps) {
  const { businessSlug } = await params;
  const data = await getOwnersWorkspaceData(businessSlug);
  if (!data.success) {
    redirect(data.error === "Unauthorized" ? "/auth/login" : `/app/${businessSlug}`);
  }

  return (
    <OwnersPageClient
      owners={data.owners}
      businessSlug={businessSlug}
      categories={data.categories}
    />
  );
}
