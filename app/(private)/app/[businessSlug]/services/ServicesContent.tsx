import { redirect } from "next/navigation";
import { ServicesPageClient } from "./ServicesPageClient";
import { getServicesWorkspaceData } from "@/features/catalog/queries/services";

interface ServicesContentProps {
  businessSlug: string;
}

export async function ServicesContent({ businessSlug }: ServicesContentProps) {
  const data = await getServicesWorkspaceData(businessSlug);
  if (!data.success) {
    if (data.error === "Unauthorized") {
      redirect("/auth/login");
    }
    redirect(`/app/${businessSlug}`);
  }

  return (
    <ServicesPageClient
      services={data.services}
      categories={data.categories}
      businessSlug={businessSlug}
    />
  );
}
