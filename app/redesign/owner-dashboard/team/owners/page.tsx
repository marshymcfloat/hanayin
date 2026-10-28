import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerTeamWorkspace from "@/components/dashboard/design-study/OwnerTeamWorkspace";
import { OwnerOwnersPreviewRoute } from "@/components/dashboard/owner-preview/OwnerOwnersPreview";

export const metadata: Metadata = { title: { absolute: "Owners — HANAYIN" }, description: "Manage owner access and service specialties.", robots: { index: false, follow: false } };
export default function OwnersPage() {
  return <OwnerTeamWorkspace page="owners" fontClassName={redesignBodyFont.variable}><OwnerOwnersPreviewRoute redesign fontClassName={redesignBodyFont.variable} /></OwnerTeamWorkspace>;
}
