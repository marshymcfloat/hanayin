import { OwnerCustomerInboxSkeleton } from "@/components/dashboard/owner-preview/OwnerCustomerInbox";

export default function InboxLoading() {
  return <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[128px]"><div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11"><header className="mb-6"><p className="text-sm font-semibold text-[#696C67]">Customers</p><h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold tracking-[-0.035em] text-[#20211F]">Customer Inbox</h1><p className="mt-2 text-base leading-6 text-[#696C67]">Messenger conversations, reply suggestions, and human takeover.</p></header><OwnerCustomerInboxSkeleton /></div></main>;
}
