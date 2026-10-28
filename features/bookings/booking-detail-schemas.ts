import "server-only";
import { z } from "zod";

export const bookingDetailIdSchema = z.number().int().positive().max(2147483647);
