import { prisma } from "@/prisma/prisma";

export async function getActiveReferralCode(code: string) {
  const referralCode = await prisma.referralCode.findUnique({ where: { code: code.toUpperCase() }, include: { business: { select: { name: true } } } });
  return referralCode?.is_active ? referralCode : null;
}
