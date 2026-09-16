import { requirePlatformAdmin } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getPlatformReferralsData() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return null;
  const [referralCodes, leads, attributions] = await Promise.all([
    prisma.referralCode.findMany({ include: { business: { select: { name: true, slug: true } } }, orderBy: { created_at: "desc" }, take: 200 }),
    prisma.referralLead.findMany({ include: { referral_code: { include: { business: { select: { name: true } } } } }, orderBy: { created_at: "desc" }, take: 200 }),
    prisma.referralAttribution.findMany({ include: { referrer_business: { select: { name: true } }, referred_business: { select: { name: true } } }, orderBy: { created_at: "desc" }, take: 200 }),
  ]);
  return { referralCodes, leads, attributions, pendingAttributions: attributions.filter((item) => item.status === "PENDING").length, qualifiedAttributions: attributions.filter((item) => item.status === "QUALIFIED").length, newLeads: leads.filter((lead) => lead.status === "NEW").length };
}
