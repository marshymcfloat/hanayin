import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerCustomersLoading } from "@/components/dashboard/design-study/OwnerCustomersLoading";

export default function Loading() { return <OwnerCustomerWorkspace page="customers" fontClassName={redesignBodyFont.variable}><OwnerCustomersLoading /></OwnerCustomerWorkspace>; }
