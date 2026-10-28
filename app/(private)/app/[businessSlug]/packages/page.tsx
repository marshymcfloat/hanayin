import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import type { ComponentProps } from "react";
import { Suspense } from "react";
import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";
import LegacyPage from "./LegacyPage";
import PreviewPage from "@/app/(private-preview)/owner-dashboard-preview/[businessSlug]/packages/page";

type Props = ComponentProps<typeof LegacyPage>;

export default function Page(props: Props) {
  return <Suspense fallback={<OwnerRouteLoading section="packages" />}><PageContent {...props} /></Suspense>;
}

async function PageContent(props: Props) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "OWNER") return <PreviewPage />;
  return <LegacyPage {...props} />;
}
