import { OwnerEmployeesPreviewRoute } from "@/components/dashboard/owner-preview/OwnerEmployeesPreview";

export const metadata = { title: "Employees Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function EmployeesPreviewPage() {
  return <OwnerEmployeesPreviewRoute />;
}
