import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import type { Metadata } from "next";

import { createReferralLeadAction } from "@/app/actions/referrals";
import ReferralStatusBanner from "@/components/forms/ReferralStatusBanner";
import { getActiveReferralCode } from "@/features/platform/queries/public-referral";

export const metadata: Metadata = {
  title: "Referral Onboarding",
  description: "Referral onboarding page for Service Flow.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl p-6">Loading...</main>}>
      <ReferralLandingContent params={params} />
    </Suspense>
  );
}

async function ReferralLandingContent({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await connection();
  const { code } = await params;

  const referralCode = await getActiveReferralCode(code);
  if (!referralCode) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Referral Link Not Available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This referral code is invalid or inactive.
        </p>
      </main>
    );
  }

  const activeReferralCode = referralCode;

  async function submitLead(formData: FormData) {
    "use server";
    await createReferralLeadAction({
      code: activeReferralCode.code,
      referredBusinessName: String(formData.get("referredBusinessName") || ""),
      ownerName: String(formData.get("ownerName") || ""),
      ownerEmail: String(formData.get("ownerEmail") || ""),
      ownerPhone: String(formData.get("ownerPhone") || ""),
      notes: String(formData.get("notes") || ""),
    });
    redirect(`/refer/${activeReferralCode.code}/?submitted=1`);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-semibold">Get Started with ServiceFlow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Referred by {activeReferralCode.business.name}. Leave your details and our team will onboard your business.
        </p>

        <Suspense fallback={null}>
          <ReferralStatusBanner />
        </Suspense>

        <form action={submitLead} className="mt-5 space-y-3">
          <input
            name="referredBusinessName"
            placeholder="Business name"
            required
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="ownerName"
            placeholder="Owner full name"
            required
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="ownerEmail"
            type="email"
            placeholder="Owner email"
            required
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="ownerPhone"
            placeholder="Owner phone (optional)"
            className="w-full rounded border px-3 py-2"
          />
          <textarea
            name="notes"
            placeholder="Notes (optional)"
            className="w-full rounded border px-3 py-2"
            rows={4}
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Submit Referral Lead
          </button>
        </form>
      </div>
    </main>
  );
}
