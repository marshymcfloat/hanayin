import "server-only";
import { z } from "zod";

export const ownerIdSchema = z.number().int().positive().max(2147483647);
export const ownerPermissionsInputSchema = z.object({
  ownerId: ownerIdSchema,
  permissions: z.array(z.string().max(100)).max(100),
});
