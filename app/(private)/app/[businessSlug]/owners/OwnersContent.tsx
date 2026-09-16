import { redirect } from "next/navigation";
import { getOwnersWorkspaceData } from "@/features/businesses/queries/owners";
import { OwnersPageClient } from "./OwnersPageClient";

interface OwnersContentProps {
  businessSlug: string;
}

export async function OwnersContent({ businessSlug }: OwnersContentProps) {
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
