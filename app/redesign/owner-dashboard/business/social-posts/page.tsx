import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerSocialPostsRedesign from "@/components/dashboard/design-study/OwnerSocialPostsRedesign";

export const metadata: Metadata = {
  title: { absolute: "Social Posts — HANAYIN" },
  description: "Prepare posts, review your content, and follow delivery to your social channels.",
  robots: { index: false, follow: false },
};

export default function SocialPostsPage() {
  return <OwnerSocialPostsRedesign fontClassName={redesignBodyFont.variable}/>;
}
