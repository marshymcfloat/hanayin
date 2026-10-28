import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getVerifiedOwnerPreviewBusinessName } from "@/features/businesses/queries/owner-preview";
import { OwnerPreviewQueryProvider } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";
import { OwnerBookingControllerProvider } from "@/components/dashboard/owner-preview/OwnerBookingController";
import OwnerRedesignWorkspaceLoading from "@/components/dashboard/design-study/OwnerRedesignWorkspaceLoading";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";

export default function OwnerRedesignLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<OwnerRedesignWorkspaceLoading fontClassName={redesignBodyFont.variable} />}><VerifiedOwnerWorkspace>{children}</VerifiedOwnerWorkspace></Suspense>;
}

async function VerifiedOwnerWorkspace({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "OWNER" || !session.user.businessSlug) redirect("/");
  if (session.user.mustChangePassword) redirect(`/app/${encodeURIComponent(session.user.businessSlug)}/change-password`);
  const owner = await resolveTenantActorContext(session.user.businessSlug, session.user.id);
  if (!owner.success || owner.actorType !== "OWNER") redirect("/");
  const business = await getVerifiedOwnerPreviewBusinessName(owner);
  if (!business) redirect("/");
  const identity = { userId: owner.userId, businessId: owner.businessId, businessSlug: owner.businessSlug, businessName: business.name, ownerName: session.user.name || "Owner" };
  return <OwnerPreviewQueryProvider key={`${identity.userId}:${identity.businessId}:${identity.businessSlug}`} identity={identity}><OwnerBookingControllerProvider bookingDesign="redesign" bookingFontClassName={redesignBodyFont.variable}>{children}</OwnerBookingControllerProvider></OwnerPreviewQueryProvider>;
}
