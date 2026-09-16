import { getServerSession, Session } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { Role } from "@/prisma/generated/prisma/enums";
import { getTenantAccessState, SUBSCRIPTION_READ_ONLY_ERROR } from "@/features/billing/subscription-service";

export type AuthResult =
  | { success: true; session: Session; businessSlug: string }
  | { success: false; error: string };

export async function requireAuth(options?: { write?: boolean }): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.businessSlug) {
    return { success: false, error: "Unauthorized" };
  }

  if (options?.write) {
    const state = await getTenantAccessState(session.user.businessSlug);
    if (state.exists && state.readOnly) {
      return { success: false, error: SUBSCRIPTION_READ_ONLY_ERROR };
    }
  }

  return {
    success: true,
    session: session,
    businessSlug: session.user.businessSlug,
  };
}

export async function requirePlatformAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false as const, error: "Unauthorized" };
  }
  if (session.user.role !== Role.PLATFORM_ADMIN) {
    return { success: false as const, error: "Forbidden" };
  }

  return { success: true as const, session };
}

export async function requireTenantAccess(
  businessSlug: string,
  options?: { write?: boolean },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false as const, error: "Unauthorized" };
  }
  if (!session.user.businessSlug) {
    return { success: false as const, error: "Unauthorized" };
  }
  if (session.user.businessSlug !== businessSlug) {
    return { success: false as const, error: "Forbidden" };
  }

  if (options?.write) {
    const state = await getTenantAccessState(businessSlug);
    if (state.exists && state.readOnly) {
      return { success: false as const, error: SUBSCRIPTION_READ_ONLY_ERROR };
    }
  }

  return { success: true as const, session, businessSlug };
}

export async function requireTenantWriteAccess(businessSlug: string) {
  return requireTenantAccess(businessSlug, { write: true });
}

export async function requireOwnerTenantWriteAccess(businessSlug: string) {
  const auth = await requireTenantWriteAccess(businessSlug);
  if (!auth.success) {
    return auth;
  }

  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }

  return auth;
}
