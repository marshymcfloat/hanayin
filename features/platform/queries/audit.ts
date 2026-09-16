import { requirePlatformAdmin } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getPlatformAuditData() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return null;
  const logs = await prisma.platformActionLog.findMany({ include: { business: { select: { name: true } }, actor_user: { select: { contact_number: true, name: true } } }, orderBy: { created_at: "desc" }, take: 300 });
  const systemActions = logs.filter((log) => !log.actor_user && !log.actor_identifier).length;
  return { logs, uniqueActionTypes: new Set(logs.map((log) => log.action)).size, systemActions, userActions: logs.length - systemActions };
}
