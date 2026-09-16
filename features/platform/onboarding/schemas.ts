import { z } from "zod";

import { BusinessStructure } from "@/prisma/generated/prisma/enums";

export const createOnboardingApplicationSchema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
  referralCode: z.string().max(50).optional(),
  requestedStructure: z.nativeEnum(BusinessStructure).optional(),
  requestedAllowEmployeeSelfBooking: z.boolean().optional(),
  requestedManagerCanServe: z.boolean().optional(),
});

export type CreateOnboardingApplicationInput = z.infer<
  typeof createOnboardingApplicationSchema
>;
