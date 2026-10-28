import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import LegacyPage from "./LegacyPage";
import PreviewPage from "@/app/(private-preview)/owner-dashboard-preview/[businessSlug]/page";

export default function Page() {
  return <Suspense fallback={<OwnerRouteLoading section="dashboard" />}><PageContent /></Suspense>;
}

async function PageContent() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "OWNER") return <PreviewPage />;
  return <LegacyPage />;
}
