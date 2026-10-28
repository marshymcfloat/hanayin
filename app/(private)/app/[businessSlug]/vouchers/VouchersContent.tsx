import { VoucherManagementClient } from "@/components/dashboard/owner/vouchers/VoucherManagementClient";
import { getVouchersWorkspaceData } from "@/features/catalog/queries/vouchers";

interface VouchersContentProps {
  params: Promise<{ businessSlug: string }>;
}

export async function VouchersContent({ params }: VouchersContentProps) {
  const { businessSlug } = await params;
  const data = await getVouchersWorkspaceData(businessSlug);

  return (
    <VoucherManagementClient
      vouchers={data.success ? data.vouchers : []}
      businessSlug={businessSlug}
      initials={data.success ? data.initials : "VO"}
    />
  );
}
