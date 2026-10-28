import "server-only";
import { compare, hash } from "bcryptjs";
import type { PasswordChangeInput } from "@/features/auth/password-schemas";
import { prisma } from "@/prisma/prisma";

export async function changeAuthenticatedUserPassword(userId: string, input: PasswordChangeInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, hashed_password: true },
  });
  if (!user) return { success: false as const, error: "User not found." };
  if (!await compare(input.currentPassword, user.hashed_password)) {
    return { success: false as const, error: "Current password is incorrect." };
  }
  const hashed = await hash(input.newPassword, 12);
  const updated = await prisma.user.updateMany({
    where: { id: userId, hashed_password: user.hashed_password },
    data: { hashed_password: hashed, must_change_password: false, temp_password_expires_at: null },
  });
  if (updated.count !== 1) {
    return { success: false as const, error: "Password changed. Please retry with your current password." };
  }
  return { success: true as const };
}
