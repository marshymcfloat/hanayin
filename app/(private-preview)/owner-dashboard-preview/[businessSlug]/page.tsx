import { OwnerDashboardPreviewQuery } from "@/components/dashboard/owner-preview/OwnerDashboardPreviewQuery";

export const metadata = {
  title: "Owner Dashboard Preview | ServiceFlow",
  robots: { index: false, follow: false },
};

export default function OwnerDashboardPreviewPage() {
  return <OwnerDashboardPreviewQuery />;
}
