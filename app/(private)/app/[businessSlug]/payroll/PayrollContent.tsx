import { redirect } from "next/navigation";
import { PayrollPageClient } from "./PayrollPageClient";
import { getPayrollWorkspaceData } from "@/features/payroll/queries/workspace";

interface PayrollContentProps {
  params: Promise<{ businessSlug: string }>;
}

export async function PayrollContent({ params }: PayrollContentProps) {
  const { businessSlug } = await params;
  const data = await getPayrollWorkspaceData(businessSlug);
  if (!data.success) redirect(data.error === "Unauthorized" ? "/auth/login" : `/app/${businessSlug}`);
  return <PayrollPageClient employees={data.employees} />;
}
