import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/features/auth/auth-options";
import { gcashBusinessSlugSchema } from "@/features/payments/manual-gcash-schemas";
import { getOwnerGcashReviewQueue } from "@/features/payments/queries/manual-gcash";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessSlug: string }> },
) {
  const parsed = gcashBusinessSlugSchema.safeParse((await params).businessSlug);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid business" }, { status: 400, headers: privateHeaders });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  }
  const actor = await resolveTenantActorContext(parsed.data, session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  }

  try {
    const queue = await getOwnerGcashReviewQueue({ businessId: actor.businessId });
    return NextResponse.json(queue, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof Error && error.message === "GCASH_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "GCash account is not configured." },
        { status: 409, headers: privateHeaders },
      );
    }
    console.error("Owner GCash review queue failed:", error);
    return NextResponse.json(
      { error: "Unable to load GCash review queue." },
      { status: 503, headers: privateHeaders },
    );
  }
}
