import { OwnerCustomersPreviewRoute } from "@/components/dashboard/owner-preview/OwnerCustomersPreview";

export const metadata = { title: "Customers Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function CustomersPreviewPage() {
  return <OwnerCustomersPreviewRoute />;
}
