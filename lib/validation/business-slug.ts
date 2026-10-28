import { z } from "zod";

export const businessSlugSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
