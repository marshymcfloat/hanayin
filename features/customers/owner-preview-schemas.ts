import { z } from "zod";

export const ownerPreviewCustomerFiltersSchema = z.object({
  search: z.string().trim().max(100).default(""),
  segment: z.enum(["all", "new", "returning"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const ownerPreviewCreateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.union([z.email().max(320), z.literal("")]).optional(),
  phone: z.string().trim().max(50).optional(),
});

export type OwnerPreviewCustomerFilters = z.infer<typeof ownerPreviewCustomerFiltersSchema>;
