import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import type { ComponentProps } from "react";
import LegacyPage from "./LegacyPage";
import PreviewPage from "@/app/(private-preview)/owner-dashboard-preview/[businessSlug]/billing/page";

type Props = ComponentProps<typeof LegacyPage>;

export default function Page(props: Props) {
  return <Suspense fallback={<OwnerRouteLoading section="billing" />}><PageContent {...props} /></Suspense>;
}

async function PageContent(props: Props) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "OWNER") return <PreviewPage />;
  return <LegacyPage {...props} />;
}