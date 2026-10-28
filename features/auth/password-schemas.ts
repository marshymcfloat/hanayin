import "server-only";
import { Buffer } from "node:buffer";
import { z } from "zod";

export const passwordChangeSchema = z.object({
  currentPassword: z.string({ error: "Password fields are required." })
    .min(1, "Password fields are required.")
    .max(4096, "Current password is too long."),
  newPassword: z.string({ error: "Password fields are required." })
    .min(1, "Password fields are required.")
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must not exceed 72 UTF-8 bytes.")
    .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must not exceed 72 UTF-8 bytes."),
});

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
