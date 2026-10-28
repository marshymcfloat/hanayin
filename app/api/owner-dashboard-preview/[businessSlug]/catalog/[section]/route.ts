import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/features/auth/auth-options";
import { resolveOwnerCatalogPreviewReadModel } from "@/features/catalog/queries/owner-catalog-preview";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const paramsSchema = z.object({
  businessSlug: businessSlugSchema,
  section: z.enum(["services", "packages", "vouchers", "gift-cards"]),
});

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessSlug: string; section: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid catalog request" }, { status: 400, headers: privateHeaders });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  }
  if (
    session.user.role !== "OWNER" ||
    session.user.businessSlug !== parsed.data.businessSlug
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  }

  const data = await resolveOwnerCatalogPreviewReadModel(
    parsed.data.section,
    parsed.data.businessSlug,
    session.user.id,
  );
  if (!data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: privateHeaders });
  }
  return NextResponse.json(data, { headers: privateHeaders });
}
