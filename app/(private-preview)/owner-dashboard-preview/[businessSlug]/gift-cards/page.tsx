import { OwnerCatalogPreviewQuery } from "@/components/dashboard/owner-preview/OwnerCatalogPreviewQuery";

export const metadata = {
  title: "Gift Cards Preview | ServiceFlow",
  robots: { index: false, follow: false },
};

export default function GiftCardsPreviewPage() {
  return <OwnerCatalogPreviewQuery section="gift-cards" />;
}
