"use server";

// Feature-owned Server Action boundary.

import { prisma } from "@/prisma/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { compare, hash } from "bcryptjs";

export async function changePasswordAction({
  currentPassword,
  newPassword,
}: {
  currentPassword: string;
  newPassword: string;
}) {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  const userId = auth.session.user.id as string;

  if (!currentPassword || !newPassword) {
    return { success: false, error: "Password fields are required." };
  }

  if (newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        hashed_password: true,
      },
    });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    const isValid = await compare(currentPassword, user.hashed_password);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect." };
    }

    const hashed = await hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        hashed_password: hashed,
        must_change_password: false,
        temp_password_expires_at: null,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to change password:", error);
    return { success: false, error: "Failed to change password." };
  }
}
