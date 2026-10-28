import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerBookingsLoading } from "@/components/dashboard/design-study/OwnerBookingsLoading";

export default function Loading() {
  return <OwnerCustomerWorkspace page="bookings" fontClassName={redesignBodyFont.variable}><OwnerBookingsLoading /></OwnerCustomerWorkspace>;
}
