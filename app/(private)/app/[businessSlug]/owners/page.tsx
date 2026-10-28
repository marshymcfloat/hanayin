import { OwnerRouteLoading } from "@/components/dashboard/owner-preview/OwnerRouteLoading";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import type { ComponentProps } from "react";
import LegacyPage from "./LegacyPage";
import { OwnerOwnersPreviewRoute } from "@/components/dashboard/owner-preview/OwnerOwnersPreview";
import { OwnersContent } from "./OwnersContent";
import { Suspense } from "react";

type Props = ComponentProps<typeof LegacyPage>;

export default function Page(props: Props) {
  return <Suspense fallback={<OwnerRouteLoading section="owners" />}><PageContent {...props} /></Suspense>;
}

async function PageContent(props: Props) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "OWNER") return <OwnerOwnersPreviewRoute management={<Suspense fallback={<div className="p-6">Loading owner management…</div>}><OwnersContent params={props.params} /></Suspense>} />;
  return <LegacyPage {...props} />;
}