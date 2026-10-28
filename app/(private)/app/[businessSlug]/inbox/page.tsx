import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { OwnerCustomerInboxRestricted, OwnerCustomerInboxRoute, OwnerCustomerInboxSkeleton } from "@/components/dashboard/owner-preview/OwnerCustomerInbox";
import { authOptions } from "@/features/auth/auth-options";
import { requireOwnerInboxAccess } from "@/features/social/customer-messaging/access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

export const metadata = { title: "Customer Inbox", robots: { index: false, follow: false } };
type Props = { params: Promise<{ businessSlug: string }> };

export default function InboxPage({ params }: Props) {
  return <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]"><div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11"><header className="mb-6"><p className="text-sm font-semibold text-[#696C67]">Customers</p><h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold tracking-[-0.035em] text-[#20211F]">Customer Inbox</h1><p className="mt-2 max-w-2xl text-base leading-6 text-[#696C67]">Messenger conversations, reply suggestions, and human takeover.</p></header><Suspense fallback={<OwnerCustomerInboxSkeleton />}><InboxContent params={params} /></Suspense></div></main>;
}

async function InboxContent({ params }: Props) {
  const parsed = businessSlugSchema.safeParse((await params).businessSlug);
  if (!parsed.success) notFound();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");
  if (session.user.role !== "OWNER") redirect(`/app/${parsed.data}`);
  const access = await requireOwnerInboxAccess(parsed.data);
  if (!access.success && access.reason !== "UNAVAILABLE") return <OwnerCustomerInboxRestricted message={access.error} />;
  return <OwnerCustomerInboxRoute />;
}
