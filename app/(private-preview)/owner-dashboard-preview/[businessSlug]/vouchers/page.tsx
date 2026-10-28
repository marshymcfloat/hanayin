import { OwnerCatalogPreviewQuery } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewQuery";

export const metadata = {
  title: "Vouchers Preview | ServiceFlow",
  robots: { index: false, follow: false },
};

export default function VouchersPreviewPage() {
  return <OwnerCatalogPreviewQuery section="vouchers" />;
}
