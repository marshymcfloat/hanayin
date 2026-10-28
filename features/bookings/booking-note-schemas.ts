import { z } from "zod";

export const bookingNotesIdSchema = z.number().int().min(1).max(2147483647);
