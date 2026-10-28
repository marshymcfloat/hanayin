import { OwnerInboxPresentation } from "@/components/dashboard/design-study/OwnerInboxPresentation";
import { OwnerCustomerInboxSkeleton } from "@/components/dashboard/owner-preview/OwnerCustomerInbox";

export function OwnerInboxLoading() {
  return <OwnerInboxPresentation><OwnerCustomerInboxSkeleton /></OwnerInboxPresentation>;
}
