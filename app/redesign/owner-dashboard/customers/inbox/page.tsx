import type { Metadata } from "next";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerInboxPresentation } from "@/components/dashboard/design-study/OwnerInboxPresentation";
import { OwnerCustomerInboxRestricted, OwnerCustomerInboxRoute, OwnerCustomerInboxSkeleton } from "@/components/dashboard/owner-preview/OwnerCustomerInbox";
import { authOptions } from "@/features/auth/auth-options";
import { requireOwnerInboxAccess } from "@/features/social/customer-messaging/access";

export const metadata: Metadata = { title: { absolute: "Customer inbox — HANAYIN" }, robots: { index: false, follow: false } };
export default function InboxPage() {
  return <OwnerCustomerWorkspace page="inbox" fontClassName={redesignBodyFont.variable}><OwnerInboxPresentation><Suspense fallback={<OwnerCustomerInboxSkeleton />}><InboxContent /></Suspense></OwnerInboxPresentation></OwnerCustomerWorkspace>;
}

async function InboxContent() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "OWNER" || !session.user.businessSlug) redirect("/");
  const access = await requireOwnerInboxAccess(session.user.businessSlug);
  if (!access.success && access.reason !== "UNAVAILABLE") return <OwnerCustomerInboxRestricted message={access.error} />;
  return <OwnerCustomerInboxRoute redesign fontClassName={redesignBodyFont.variable} />;
}
