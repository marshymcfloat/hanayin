import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getCachedPackages, getCachedServices } from "@/lib/data/cached";
import { OwnerPreviewBookingCreateButton } from "@/components/dashboard/owner-preview/OwnerPreviewBookingCreateButton";
import { OwnerBookingsPreviewRoute } from "@/components/dashboard/owner-preview/OwnerBookingsPreview";

export async function OwnerBookingsWorkspace({ params, redesign = false, fontClassName = "" }: { params?: Promise<{ businessSlug: string }>; redesign?: boolean; fontClassName?: string }) {
  const session = await getServerSession(authOptions);
  const businessSlug = params ? (await params).businessSlug : redesign ? session?.user?.businessSlug : undefined;
  if (!businessSlug || !session?.user?.id || session.user.role !== "OWNER" || session.user.businessSlug !== businessSlug) return null;
  const actor = await resolveTenantActorContext(businessSlug, session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") return null;
  if (redesign) {
    const services = await getCachedServices(actor.businessId);
    return <OwnerBookingsPreviewRoute redesign fontClassName={fontClassName} servicesCatalog={services.map(({ id, name, category, price, duration }) => ({ id, name, category, price, duration }))} />;
  }
  const [services, packages] = await Promise.all([getCachedServices(actor.businessId), getCachedPackages(actor.businessId)]);
  const categories = Array.from(new Set(services.map((service) => service.category)));
  return <OwnerBookingsPreviewRoute servicesCatalog={services.map((service) => ({ id: service.id, name: service.name, category: service.category, price: service.price, duration: service.duration }))} bookingAction={<OwnerPreviewBookingCreateButton businessSlug={businessSlug} services={services} packages={packages} categories={categories} />} />;
}
