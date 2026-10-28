import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerNotificationsPreviewRoute } from "@/components/dashboard/owner-preview/OwnerNotificationsPreview";

export const metadata: Metadata = { title: { absolute: "Notifications — HANAYIN" }, description: "Read-only SMS and email delivery history.", robots: { index: false, follow: false } };
export default function NotificationsPage() {
  return <OwnerCustomerWorkspace page="notifications" fontClassName={redesignBodyFont.variable}><OwnerNotificationsPreviewRoute redesign fontClassName={redesignBodyFont.variable} /></OwnerCustomerWorkspace>;
}
