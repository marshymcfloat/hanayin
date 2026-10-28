import { OwnerCatalogPreviewQuery } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewQuery";

export const metadata = {
  title: "Packages Preview | ServiceFlow",
  robots: { index: false, follow: false },
};

export default function PackagesPreviewPage() {
  return <OwnerCatalogPreviewQuery section="packages" />;
}
