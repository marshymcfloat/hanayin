import { getServerSession } from "next-auth";
import { prisma } from "@/prisma/prisma";

import { authOptions } from "@/lib/next auth/options";
import { SidebarSkeleton } from "./SidebarSkeleton";
import { AppSidebarClient } from "./AppSidebarClient";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";

export async function AppSidebar() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return <SidebarSkeleton />;
  }

  const { name, email, role } = session.user;
  let slug = session.user.businessSlug;

  // Fallback: If slug is missing in session (e.g. old session), try to fetch it
  if (!slug) {
    const userWithBusiness = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        employee: { include: { business: true } },
        owner: { include: { business: true } },
      },
    });

    slug =
      userWithBusiness?.employee?.business.slug ??
      userWithBusiness?.owner?.business.slug;
  }

  // Final fallback
  if (!slug) {
    slug = "demo";
  }

  const entitlements = await getBusinessEntitlementsBySlug(slug);

  return (
    <AppSidebarClient
      businessSlug={slug}
      entitlements={entitlements}
      user={{
        name: name || "User",
        email: email || "",
        role: role || "EMPLOYEE",
      }}
    />
  );
}
