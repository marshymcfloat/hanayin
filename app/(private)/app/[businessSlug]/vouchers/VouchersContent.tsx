import { VoucherManagementClient } from "@/components/dashboard/owner/vouchers/VoucherManagementClient";
import { getVouchersWorkspaceData } from "@/features/catalog/queries/vouchers";

interface VouchersContentProps {
  businessSlug: string;
}

export async function VouchersContent({ businessSlug }: VouchersContentProps) {
  const data = await getVouchersWorkspaceData(businessSlug);

  return (
    <VoucherManagementClient
      vouchers={data.success ? data.vouchers : []}
      businessSlug={businessSlug}
      initials={data.success ? data.initials : "VO"}
    />
  );
}
