import { redirect } from "next/navigation";
import { getEmployeesWorkspaceData } from "@/features/workforce/queries/employees";
import { EmployeesPageClient } from "./EmployeesPageClient";

interface EmployeesContentProps {
  params: Promise<{ businessSlug: string }>;
}

export async function EmployeesContent({
  params,
}: EmployeesContentProps) {
  const { businessSlug } = await params;
  const data = await getEmployeesWorkspaceData(businessSlug);
  if (!data.success) {
    redirect(data.error === "Unauthorized" ? "/auth/login" : `/app/${businessSlug}`);
  }

  return (
    <EmployeesPageClient
      employees={data.employees}
      businessSlug={businessSlug}
      categories={data.categories}
      canAccessPayroll={data.canAccessPayroll}
      canManageCompensation={data.canManageCompensation}
    />
  );
}
