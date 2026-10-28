"use server";

import { requireAuth } from "@/lib/auth/guards";
import { passwordChangeSchema } from "@/features/auth/password-schemas";
import { changeAuthenticatedUserPassword } from "@/features/auth/services/password-change";

export async function changePasswordAction(input: unknown) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    const validation = passwordChangeSchema.safeParse(input);
    if (!validation.success) {
      return { success: false as const, error: validation.error.issues[0]?.message ?? "Invalid input" };
    }
    return await changeAuthenticatedUserPassword(auth.session.user.id, validation.data);
  } catch {
    return { success: false as const, error: "Failed to change password." };
  }
}
