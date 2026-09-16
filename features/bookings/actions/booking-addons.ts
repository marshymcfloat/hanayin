"use server";

// Feature-owned Server Action boundary.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import {
  appendServicesToUntouchedBooking,
  BookingAddOnStateRaceError,
  createFollowUpAddOnBooking,
  resolveAddOnMutationMode,
} from "@/features/bookings/services/booking-addons";

const addOnServiceSchema = z.object({
  id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(10),
  packageId: z.coerce.number().int().positive().optional(),
  claimedByCurrentEmployee: z.boolean().optional(),
});

const addBookingServiceOrCreateFollowUpSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  services: z.array(addOnServiceSchema).min(1),
  initiatorEmployeeId: z.coerce.number().int().positive().optional(),
  staffSelectionMode: z
    .enum(["ANY_AVAILABLE", "PREFER_SELECTED", "REQUIRE_SELECTED"])
    .optional(),
});

export type AddBookingServiceOrCreateFollowUpResult =
  | { mode: "APPENDED"; bookingId: number }
  | {
      mode: "FOLLOW_UP_CREATED";
      bookingId: number;
      parentBookingId: number;
    };

async function resolveInitiatorEmployeeId(params: {
  requestedEmployeeId?: number;
  actorContext: Extract<
    Awaited<ReturnType<typeof resolveTenantActorContext>>,
    { success: true }
  >;
}) {
  const { requestedEmployeeId, actorContext } = params;

  if (actorContext.actorType === "EMPLOYEE") {
    if (
      requestedEmployeeId !== undefined &&
      requestedEmployeeId !== actorContext.employeeId
    ) {
      throw new Error("Forbidden");
    }

    return actorContext.employeeId;
  }

  if (requestedEmployeeId === undefined) {
    return undefined;
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: requestedEmployeeId,
      business_id: actorContext.businessId,
    },
    select: {
      id: true,
    },
  });

  if (!employee) {
    throw new Error("Employee not found.");
  }

  return employee.id;
}

export async function addBookingServiceOrCreateFollowUpAction(
  input: z.input<typeof addBookingServiceOrCreateFollowUpSchema>,
): Promise<AddBookingServiceOrCreateFollowUpResult> {
  const validation = addBookingServiceOrCreateFollowUpSchema.safeParse(input);
  if (!validation.success) {
    throw new Error("Invalid input");
  }

  const auth = await requireAuth({ write: true });
  if (!auth.success) {
    throw new Error(auth.error);
  }

  const actorContext = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );

  if (!actorContext.success) {
    throw new Error(actorContext.error);
  }

  // Accept either the legacy BOOKING_CREATE gate (existing managers,
  // staff, cashiers all have this when they can create bookings at all)
  // or the new BOOKING_MODIFY gate (preferred going forward — see
  // docs/role-permissions-matrix.md). Owners short-circuit through
  // hasStaffPermission and pass either branch.
  if (
    actorContext.actorType === "EMPLOYEE" &&
    !hasStaffPermission(actorContext, StaffPermission.BOOKING_CREATE) &&
    !hasStaffPermission(actorContext, StaffPermission.BOOKING_MODIFY)
  ) {
    throw new Error("Forbidden");
  }

  const initiatorEmployeeId = await resolveInitiatorEmployeeId({
    requestedEmployeeId: validation.data.initiatorEmployeeId,
    actorContext,
  });

  const modeResolution = await resolveAddOnMutationMode(
    validation.data.bookingId,
    actorContext,
  );

  if (modeResolution.mode === "APPEND") {
    try {
      const appended = await appendServicesToUntouchedBooking({
        bookingId: validation.data.bookingId,
        actorContext,
        services: validation.data.services,
        currentEmployeeId: initiatorEmployeeId,
      });

      revalidatePath(`/app/${auth.businessSlug}`);
      revalidatePath(`/app/${auth.businessSlug}/bookings`);

      return {
        mode: "APPENDED",
        bookingId: appended.bookingId,
      };
    } catch (error) {
      if (!(error instanceof BookingAddOnStateRaceError)) {
        throw error;
      }
    }
  }

  const followUp = await createFollowUpAddOnBooking({
    bookingId: validation.data.bookingId,
    actorContext,
    services: validation.data.services,
    currentEmployeeId: initiatorEmployeeId,
    staffSelectionMode: validation.data.staffSelectionMode,
  });

  revalidatePath(`/app/${auth.businessSlug}`);
  revalidatePath(`/app/${auth.businessSlug}/bookings`);

  return {
    mode: "FOLLOW_UP_CREATED",
    bookingId: followUp.bookingId,
    parentBookingId: followUp.parentBookingId,
  };
}
