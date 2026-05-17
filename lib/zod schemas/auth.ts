import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(128, { message: "Password is too long" });

const contactNumberSchema = z
  .string()
  .trim()
  .min(7, { message: "Enter a valid contact number" })
  .max(20, { message: "Contact number is too long" });

export const loginSchema = z.object({
  contact_number: contactNumberSchema,
  password: z.string().min(1, { message: "Password is required" }),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { message: "Name must be at least 2 characters" })
      .max(80, { message: "Name is too long" }),
    contact_number: contactNumberSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type LoginSchemaType = z.infer<typeof loginSchema>;
export type RegisterSchemaType = z.infer<typeof registerSchema>;
