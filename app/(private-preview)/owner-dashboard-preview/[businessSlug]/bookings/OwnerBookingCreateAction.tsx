import { getServerSession } from "next-auth";
import { OwnerPreviewBookingCreateButton } from "@/components/dashboard/owner-preview/OwnerPreviewBookingCreateButton";
import { authOptions } from "@/features/auth/auth-options";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getCachedPackages, getCachedServices } from "@/lib/data/cached";

export async function OwnerBookingCreateAction({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "OWNER" || session.user.businessSlug !== businessSlug) return null;
  const actor = await resolveTenantActorContext(businessSlug, session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") return null;
  const [services, packages] = await Promise.all([
    getCachedServices(actor.businessId),
    getCachedPackages(actor.businessId),
  ]);
  const categories = Array.from(new Set(services.map((service) => service.category)));
  return <OwnerPreviewBookingCreateButton businessSlug={businessSlug} services={services} packages={packages} categories={categories} />;
}
