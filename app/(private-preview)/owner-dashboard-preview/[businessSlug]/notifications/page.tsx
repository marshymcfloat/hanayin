import { OwnerNotificationsPreviewRoute } from "@/components/dashboard/owner-preview/OwnerNotificationsPreview";

export const metadata = { title: "Notifications Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function NotificationsPreviewPage() {
  return <OwnerNotificationsPreviewRoute />;
}
