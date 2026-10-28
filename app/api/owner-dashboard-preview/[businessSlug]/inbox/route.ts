import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/features/auth/auth-options";
import { requireOwnerInboxAccess } from "@/features/social/customer-messaging/access";
import { getConversationDetail, getInboxSnapshot } from "@/features/social/customer-messaging/inbox-service";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const requestSchema = z.object({
  businessSlug: businessSlugSchema,
  conversationId: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
}).strict();
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const search = new URL(request.url).searchParams;
  const parsed = requestSchema.safeParse({ ...(await params), ...(search.has("conversationId") ? { conversationId: search.get("conversationId") } : {}) });
  if (!parsed.success || [...search.keys()].some((key) => key !== "conversationId") || search.getAll("conversationId").length > 1) {
    return NextResponse.json({ error: "Invalid inbox request." }, { status: 400, headers: privateHeaders });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  if (session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data.businessSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  }
  const access = await requireOwnerInboxAccess(parsed.data.businessSlug);
  if (!access.success) {
    return NextResponse.json({ error: access.error }, { status: access.reason === "UNAVAILABLE" ? 503 : 403, headers: privateHeaders });
  }
  try {
    if (parsed.data.conversationId) {
      const detail = await getConversationDetail(access.context.businessId, parsed.data.conversationId);
      return detail
        ? NextResponse.json(detail, { headers: privateHeaders })
        : NextResponse.json({ error: "Conversation is unavailable." }, { status: 404, headers: privateHeaders });
    }
    const snapshot = await getInboxSnapshot(access.context.businessId);
    return NextResponse.json({ ...snapshot, aiEntitled: access.aiEntitled }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Customer Inbox could not load. Please retry." }, { status: 503, headers: privateHeaders });
  }
}
