import "server-only";
import { z } from "zod";
import { ownerIdSchema } from "@/features/workforce/owner-administration-schemas";

export const ownerSpecialtiesSchema = z.object({
  ownerId: ownerIdSchema,
  specialties: z.array(z.string().min(1).max(200)).max(100),
});
