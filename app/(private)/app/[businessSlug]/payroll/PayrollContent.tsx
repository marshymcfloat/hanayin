import { redirect } from "next/navigation";
import { PayrollPageClient } from "./PayrollPageClient";
import { getPayrollWorkspaceData } from "@/features/payroll/queries/workspace";

interface PayrollContentProps {
  businessSlug: string;
}

export async function PayrollContent({ businessSlug }: PayrollContentProps) {
  const data = await getPayrollWorkspaceData(businessSlug);
  if (!data.success) redirect(data.error === "Unauthorized" ? "/auth/login" : `/app/${businessSlug}`);
  return <PayrollPageClient employees={data.employees} />;
}
