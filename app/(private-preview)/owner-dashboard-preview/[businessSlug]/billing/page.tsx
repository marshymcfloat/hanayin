import { OwnerBillingPreviewQuery } from "@/components/dashboard/owner-preview/OwnerBillingPreviewQuery";

export const metadata = { title: "Billing Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function BillingPreviewPage() {
  return <OwnerBillingPreviewQuery />;
}
