import "server-only";
import { resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import { bookingDeletionIdSchema } from "@/features/bookings/booking-deletion-schemas";
import { prisma } from "@/prisma/prisma";

type BookingDeletionOwner = Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;
const failure = (error: string) => ({ success: false as const, error });

export async function deleteBookingPermanently(actor: BookingDeletionOwner, bookingId: number) {
  const validation = bookingDeletionIdSchema.safeParse(bookingId);
  if (!validation.success) return failure("Invalid input");
  if (actor.actorType !== "OWNER" || actor.role !== "OWNER") return failure("Unauthorized");
  try {
    return await prisma.$transaction(async tx => {
      const current = await resolveTenantActorContext(actor.businessSlug, actor.userId, tx);
      if (!current.success || current.actorType !== "OWNER" || current.role !== "OWNER" || current.businessId !== actor.businessId || current.businessSlug !== actor.businessSlug || current.ownerId !== actor.ownerId) return failure("Forbidden");
      await tx.booking.delete({
        where: {
          id: validation.data,
          business_id: current.businessId,
          vouchers: { every: { business_id: current.businessId } },
          availed_services: { every: { price_adjustments: { every: { booking: { business_id: current.businessId } } } } },
          business: {
            id: current.businessId,
            slug: current.businessSlug,
            owners: { some: { id: current.ownerId, user_id: current.userId, business_id: current.businessId, user: { role: "OWNER" } } },
          },
        },
        select: { id: true },
      });
      return { success: true as const };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch (error) {
    return failure(error && typeof error === "object" && "code" in error && error.code === "P2025" ? "Failed to delete." : "Failed to delete");
  }
}
