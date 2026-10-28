import { OwnerBusinessHoursPreviewQuery } from "@/components/dashboard/owner-preview/OwnerBusinessHoursPreviewQuery";

export const metadata = { title: "Business Hours Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function BusinessHoursPreviewPage() {
  return <OwnerBusinessHoursPreviewQuery />;
}
