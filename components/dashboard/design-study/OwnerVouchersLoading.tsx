import { OwnerServicesLoading } from "@/components/dashboard/design-study/OwnerServicesLoading";

export function OwnerVouchersLoading({ fontClassName = "" }: { fontClassName?: string }) {
  return <OwnerServicesLoading label="vouchers" fontClassName={fontClassName} />;
}
