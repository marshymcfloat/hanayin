import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import type { ComponentProps } from "react";
import { Suspense } from "react";
import LegacyPage from "./LegacyPage";
import { OwnerBookingsWorkspace } from "@/components/dashboard/owner-preview/OwnerBookingsWorkspace";

type Props = ComponentProps<typeof LegacyPage>;

export default function Page(props: Props) {
  return <Suspense fallback={<OwnerRouteLoading section="bookings" />}><PageContent {...props} /></Suspense>;
}

async function PageContent(props: Props) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "OWNER") return <Suspense fallback={<div className="min-h-dvh bg-[#F5F6F3]" aria-label="Loading bookings" />}><OwnerBookingsWorkspace params={props.params} /></Suspense>;
  return <LegacyPage {...props} />;
}
