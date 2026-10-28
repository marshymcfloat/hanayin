"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext, hasStaffPermission } from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { bookingChangeEditorSchema, bookingChangeSchema } from "@/features/bookings/booking-change-schemas";
import { readBookingChangeEditor, reviewBookingChange, BookingChangeError } from "@/features/bookings/services/booking-reviewed-change";
import { BookingAvailabilityError } from "@/features/bookings/services/booking-availability";

async function actor() {
  const auth = await requireAuth({ write: true });
  if (!auth.success) throw new BookingChangeError("Unauthorized");
  const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
  if (!context.success || !hasStaffPermission(context, StaffPermission.BOOKING_MODIFY)) throw new BookingChangeError("Forbidden");
  return context;
}
const safeError = (error: unknown) => error instanceof BookingChangeError || error instanceof BookingAvailabilityError ? error.message : "The change could not be confirmed. Check package choices and voucher, or refresh the booking before retrying.";
export async function getBookingChangeEditorAction(input: unknown) {
  const parsed = bookingChangeEditorSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid booking." };
  try { return { success: true as const, data: await readBookingChangeEditor(await actor(), parsed.data.bookingId) }; } catch (error) { return { success: false as const, error: safeError(error) }; }
}
export async function reviewBookingChangeAction(input: unknown) {
  const parsed = bookingChangeSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Check the selected services and package choices." };
  try {
    const context = await actor();
    const result = await reviewBookingChange(context, parsed.data);
    if (result.applied) for (const path of [`/app/${context.businessSlug}`, `/app/${context.businessSlug}/bookings`, "/redesign/owner-dashboard/customers/bookings"]) { try { revalidatePath(path); } catch { /* The reviewed financial change already committed. */ } }
    return { success: true as const, ...result };
  } catch (error) { return { success: false as const, error: safeError(error) }; }
}
