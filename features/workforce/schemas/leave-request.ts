import { z } from "zod";

import { LeaveRequestStatus, LeaveType } from "@/prisma/generated/prisma/enums";

export const createLeaveRequestSchema = z.object({
  employee_id: z.number().int().positive(),
  business_id: z.string().min(1),
  start_date: z.date(),
  end_date: z.date(),
  reason: z.string().min(1, "Reason is required"),
  type: z.nativeEnum(LeaveType),
  businessSlug: z.string().min(1),
});

export const updateLeaveRequestStatusSchema = z.object({
  requestId: z.number().int().positive(),
  status: z.nativeEnum(LeaveRequestStatus),
  adminComment: z.string().optional(),
  isPaid: z.boolean().optional(),
});

export const leaveRequestIdSchema = z.number().int().positive();

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
