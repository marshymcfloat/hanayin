import "server-only";
import { serviceIdSchema } from "@/features/dashboard/schemas";

export const ownerQueueServiceIdSchema = serviceIdSchema.extend({
  serviceId: serviceIdSchema.shape.serviceId.max(2147483647),
});
