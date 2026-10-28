import { OwnerCatalogPreviewQuery } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewQuery";

export const metadata = {
  title: "Services Preview | ServiceFlow",
  robots: { index: false, follow: false },
};

export default function ServicesPreviewPage() {
  return <OwnerCatalogPreviewQuery section="services" />;
}
