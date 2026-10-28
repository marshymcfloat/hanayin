import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { getOwnerNotificationHistory } from "@/features/notifications/queries/history";
import { notificationHistorySchema } from "@/features/notifications/schemas";
import type { NotificationHistoryResponse } from "@/features/notifications/types";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const url = new URL(request.url);
  const pageValue = url.searchParams.get("page");
  const eventType = url.searchParams.get("type") ?? undefined;
  const slug = businessSlugSchema.safeParse((await params).businessSlug);
  if (!slug.success) return NextResponse.json({ error: "Invalid business" }, { status: 400, headers });
  const parsed = notificationHistorySchema.safeParse({
    businessSlug: slug.data,
    options: { page: pageValue === null ? 1 : Number(pageValue), eventType },
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification filter" }, { status: 400, headers });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data.businessSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const actor = await resolveTenantActorContext(parsed.data.businessSlug, session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }

  try {
    const result = await getOwnerNotificationHistory(actor, parsed.data.options);
    const data: NotificationHistoryResponse = {
      notifications: result.notifications.map((notification) => ({
        ...notification,
        sentAt: notification.sentAt.toISOString(),
      })),
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load notification history" }, { status: 500, headers });
  }
}
