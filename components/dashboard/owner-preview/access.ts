export type PreviewAccessInput = {
  authenticated: boolean;
  role?: string | null;
  sessionBusinessSlug?: string | null;
  requestedBusinessSlug: string;
};

export type PreviewAccessDecision =
  | { allowed: true }
  | { allowed: false; redirectTo: string };

export function resolveOwnerPreviewAccess({
  authenticated,
  role,
  sessionBusinessSlug,
  requestedBusinessSlug,
}: PreviewAccessInput): PreviewAccessDecision {
  if (!authenticated || !sessionBusinessSlug) {
    return { allowed: false, redirectTo: "/" };
  }

  if (role !== "OWNER") {
    return { allowed: false, redirectTo: `/app/${sessionBusinessSlug}` };
  }

  if (sessionBusinessSlug !== requestedBusinessSlug) {
    return {
      allowed: false,
      redirectTo: `/owner-dashboard-preview/${sessionBusinessSlug}`,
    };
  }

  return { allowed: true };
}
