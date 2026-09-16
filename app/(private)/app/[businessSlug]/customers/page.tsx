import { notFound } from "next/navigation";
import { CustomersClient } from "@/components/dashboard/customers/CustomersClient";
import { getCustomersWorkspaceData } from "@/features/customers/queries/workspace";

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;

  const data = await getCustomersWorkspaceData(businessSlug);
  if (!data.success) notFound();
  return <CustomersClient customers={data.customers} businessSlug={businessSlug} />;
}
