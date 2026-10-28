import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerNotificationsLoading } from "@/components/dashboard/design-study/OwnerNotificationsLoading";

export default function Loading() {
  return <OwnerCustomerWorkspace page="notifications" fontClassName={redesignBodyFont.variable}><OwnerNotificationsLoading /></OwnerCustomerWorkspace>;
}
