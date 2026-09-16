import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createOnboardingLoginToken } from "@/lib/security/onboarding-login-token";
import { prisma } from "@/prisma/prisma";
import { logPlatformAction } from "./platform-action-log";

export async function impersonateBusinessOwner(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      slug: true,
      name: true,
      owners: {
        orderBy: [{ is_primary: "desc" }, { id: "asc" }],
        take: 1,
        select: { user_id: true },
      },
    },
  });
  if (!business)
    return { success: false as const, error: "Business not found" };
  const ownerUserId = business.owners[0]?.user_id;
  if (!ownerUserId) {
    return { success: false as const, error: "Business has no owner record" };
  }
  const ttlSeconds = 15 * 60;
  const magicToken = createOnboardingLoginToken({
    userId: ownerUserId,
    applicationId: `impersonate:${auth.session.user.id}:${business.id}`,
    ttlSeconds,
  });
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const magicLink = `${baseUrl}/login/magic?token=${encodeURIComponent(
    magicToken,
  )}&slug=${encodeURIComponent(business.slug)}`;
  await logPlatformAction({
    action: "BUSINESS_OWNER_IMPERSONATED",
    targetType: "Business",
    targetId: business.id,
    businessId,
    metadata: { ownerUserId, ttlSeconds },
  });
  return {
    success: true as const,
    data: {
      magicLink,
      expiresInSeconds: ttlSeconds,
      businessName: business.name,
    },
  };
}
