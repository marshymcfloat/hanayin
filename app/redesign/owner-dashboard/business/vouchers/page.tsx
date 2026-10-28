import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerVouchersRedesign from "@/components/dashboard/design-study/OwnerVouchersRedesign";

export const metadata: Metadata = {
  title: { absolute: "Vouchers — HANAYIN" },
  description: "Manage your voucher codes, discounts, eligibility, and expiry.",
  robots: { index: false, follow: false },
};

export default function VouchersPage() {
  return <OwnerVouchersRedesign fontClassName={redesignBodyFont.variable} />;
}
