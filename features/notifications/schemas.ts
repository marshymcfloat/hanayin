import { z } from "zod";
import { NOTIFICATION_EVENT_TYPES } from "@/features/notifications/types";

export const notificationHistorySchema = z.object({
  businessSlug: z.string().trim().min(1).max(200),
  options: z.object({
    page: z.number().int().min(1).max(10000).default(1),
    eventType: z.union([z.enum(NOTIFICATION_EVENT_TYPES), z.literal("")])
      .optional().transform(value => value || undefined),
  }),
});
