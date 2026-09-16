import { redirect } from "next/navigation";
import { PackagesPageClient } from "./PackagesPageClient";
import { getPackagesWorkspaceData } from "@/features/catalog/queries/packages";

interface PackagesContentProps {
  businessSlug: string;
}

export async function PackagesContent({ businessSlug }: PackagesContentProps) {
  const data = await getPackagesWorkspaceData(businessSlug);
  if (!data.success) {
    if (data.error === "Unauthorized") {
      redirect("/auth/login");
    }
    redirect(`/app/${businessSlug}`);
  }

  return (
    <PackagesPageClient
      packages={data.packages}
      services={data.services}
      categories={data.categories}
      businessSlug={businessSlug}
    />
  );
}
