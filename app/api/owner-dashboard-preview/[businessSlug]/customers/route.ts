import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authOptions } from "@/features/auth/auth-options";
import { customerMutationError, createTenantCustomer } from "@/features/customers/services/customer-administration";
import { ownerPreviewCreateCustomerSchema, ownerPreviewCustomerFiltersSchema } from "@/features/customers/owner-preview-schemas";
import { getOwnerPreviewCustomers } from "@/features/customers/queries/owner-preview";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ businessSlug: string }> };

export async function GET(request: Request, { params }: Context) {
  const parsed = businessSlugSchema.safeParse((await params).businessSlug);
  if (!parsed.success) return NextResponse.json({ error: "Invalid business" }, { status: 400, headers });
  const url = new URL(request.url);
  const filters = ownerPreviewCustomerFiltersSchema.safeParse({
    search: url.searchParams.get("search") ?? "",
    segment: url.searchParams.get("segment") ?? "all",
    page: url.searchParams.get("page") ?? "1",
  });
  if (!filters.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400, headers });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const actor = await resolveTenantActorContext(parsed.data, session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });

  try {
    const data = await getOwnerPreviewCustomers(actor, filters.data);
    if (!data) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load customers" }, { status: 500, headers });
  }
}

export async function POST(request: Request, { params }: Context) {
  const parsed = businessSlugSchema.safeParse((await params).businessSlug);
  if (!parsed.success) return NextResponse.json({ error: "Invalid business" }, { status: 400, headers });
  const length = Number(request.headers.get("content-length"));
  if (length > 4096) return NextResponse.json({ error: "Invalid customer details" }, { status: 400, headers });
  let raw: unknown;
  try {
    const body = await request.text();
    if (body.length > 4096) return NextResponse.json({ error: "Invalid customer details" }, { status: 400, headers });
    raw = JSON.parse(body);
  } catch { return NextResponse.json({ error: "Invalid customer details" }, { status: 400, headers }); }
  const input = ownerPreviewCreateCustomerSchema.safeParse(raw);
  if (!input.success) return NextResponse.json({ error: "Invalid customer details" }, { status: 400, headers });

  const auth = await requireOwnerTenantWriteAccess(parsed.data);
  if (!auth.success) return NextResponse.json({ error: auth.error }, { status: auth.error === "Unauthorized" ? 401 : 403, headers });
  if (!auth.session.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (auth.session.user.role !== "OWNER" || auth.session.user.businessSlug !== parsed.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const actor = await resolveTenantActorContext(parsed.data, auth.session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });

  try {
    const created = await createTenantCustomer(actor, {
      name: input.data.name,
      email: input.data.email || undefined,
      phone: input.data.phone || undefined,
    });
    try { revalidatePath(`/app/${parsed.data}/customers`); } catch { /* The write committed; preview data uses targeted refetch. */ }
    return NextResponse.json({
      id: created.id, name: created.name, email: created.email, phone: created.phone,
      joinedAt: created.created_at.toISOString(), completedVisits: 0, lastVisitAt: null,
    }, { status: 201, headers });
  } catch (error) {
    const message = customerMutationError(error, "Unable to create customer");
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 500, headers });
  }
}
