import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { getNotificationHistoryAction } from "@/lib/server actions/notifications";
import { NotificationsPageClient } from "@/components/dashboard/owner/notifications/NotificationsPageClient";

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessSlug } = await params;
  const rawParams = await searchParams;

  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  const page = typeof rawParams.page === "string" ? Math.max(1, Number.parseInt(rawParams.page, 10) || 1) : 1;
  const eventType = typeof rawParams.type === "string" ? rawParams.type : undefined;

  const result = await getNotificationHistoryAction(businessSlug, { page, eventType });

  if (!result.success) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    );
  }

  return (
    <NotificationsPageClient
      businessSlug={businessSlug}
      notifications={result.notifications.map((n) => ({
        ...n,
        sentAt: n.sentAt.toISOString(),
      }))}
      totalCount={result.totalCount}
      page={result.page}
      totalPages={result.totalPages}
      currentType={eventType}
    />
  );
}
