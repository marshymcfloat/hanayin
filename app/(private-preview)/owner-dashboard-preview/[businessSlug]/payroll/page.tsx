import { OwnerPayrollPreviewRoute } from "@/components/dashboard/owner-preview/OwnerPayrollPreviewQuery";

export const metadata = { title: "Payroll Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function PayrollPreviewPage() {
  return <OwnerPayrollPreviewRoute />;
}
