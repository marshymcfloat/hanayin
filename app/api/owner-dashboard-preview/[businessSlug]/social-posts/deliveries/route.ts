import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/features/auth/auth-options";
import { resolveOwnerSocialPostDeliveryPreview } from "@/features/social/queries/owner-social-post-preview";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const paramsSchema = z.object({ businessSlug: businessSlugSchema });
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessSlug: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid delivery request" }, { status: 400, headers: privateHeaders });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  if (session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data.businessSlug) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  }
  const result = await resolveOwnerSocialPostDeliveryPreview(parsed.data.businessSlug, session.user.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.reason === "FORBIDDEN" ? 403 : 503, headers: privateHeaders });
  }
  return NextResponse.json(result.data, { headers: privateHeaders });
}
