import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerInboxLoading } from "@/components/dashboard/design-study/OwnerInboxLoading";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";

export default function Loading() {
  return <OwnerCustomerWorkspace page="inbox" fontClassName={redesignBodyFont.variable}><OwnerInboxLoading /></OwnerCustomerWorkspace>;
}
