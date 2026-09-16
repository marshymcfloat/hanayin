import { requirePlatformAdmin } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getPlatformInvoicesData() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return null;
  const [invoices, subscriptions] = await Promise.all([
    prisma.subscriptionInvoice.findMany({ include: { business: { select: { name: true, slug: true } }, plan: { select: { code: true } } }, orderBy: { created_at: "desc" }, take: 200 }),
    prisma.businessSubscription.findMany({ include: { business: { select: { name: true } }, plan: { select: { code: true } } }, orderBy: { updated_at: "desc" }, take: 100 }),
  ]);
  return { invoices, subscriptions };
}
