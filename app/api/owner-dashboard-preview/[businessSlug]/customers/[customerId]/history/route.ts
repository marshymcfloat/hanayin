import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/features/auth/auth-options";
import { customerIdSchema } from "@/features/customers/customer-schemas";
import { getOwnerPreviewCustomerHistory } from "@/features/customers/queries/owner-preview";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ businessSlug: string; customerId: string }> }) {
  const values = await params;
  const slug = businessSlugSchema.safeParse(values.businessSlug);
  const customerId = customerIdSchema.safeParse(values.customerId);
  if (!slug.success || !customerId.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (session.user.role !== "OWNER" || session.user.businessSlug !== slug.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const actor = await resolveTenantActorContext(slug.data, session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });

  try {
    const data = await getOwnerPreviewCustomerHistory(actor, customerId.data);
    if (!data) return NextResponse.json({ error: "Customer not found" }, { status: 404, headers });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load customer history" }, { status: 500, headers });
  }
}
