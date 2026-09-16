import { redirect } from "next/navigation";
import { getGiftCardsWorkspaceData } from "@/features/gift-cards/queries/workspace";
import { GiftCardsPageClient } from "./GiftCardsPageClient";

interface GiftCardsContentProps {
  businessSlug: string;
}

export async function GiftCardsContent({ businessSlug }: GiftCardsContentProps) {
  const data = await getGiftCardsWorkspaceData(businessSlug);
  if (!data.success) redirect(data.error === "Unauthorized" ? "/auth/login" : "/");

  return (
    <GiftCardsPageClient
      giftCards={data.giftCards}
      services={data.services}
      packages={data.packages}
      initials={data.initials}
      businessSlug={businessSlug}
    />
  );
}
