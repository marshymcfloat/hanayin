import { OwnerOwnersPreviewRoute } from "@/components/dashboard/owner-preview/OwnerOwnersPreview";

export const metadata = { title: "Owners Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function OwnersPreviewPage() {
  return <OwnerOwnersPreviewRoute />;
}
