import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/prisma/prisma";
import { verifyOnboardingStatusToken } from "@/lib/security/onboarding-status-token";
import { createOnboardingLoginToken } from "@/lib/security/onboarding-login-token";
import { formatBusinessStructureLabel } from "@/lib/business-structure";
import { rateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = {
  title: "Application Status",
  robots: {
    index: false,
    follow: false,
  },
};

type ApplyStatusPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

function getStatusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED" || normalized === "CONVERTED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "REJECTED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized === "CONTACTED") {
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function ApplyStatusPage({ searchParams }: ApplyStatusPageProps) {
  return (
    <Suspense fallback={<ApplyStatusFallback />}>
      <ApplyStatusContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ApplyStatusContent({ searchParams }: ApplyStatusPageProps) {
  await connection();
  const params = await searchParams;
  // Prefer the URL token (email-link flow, allows opening from a different
  // device); fall back to the httpOnly cookie set on submission.
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("sf_apply_status_token")?.value?.trim();
  const token = params?.token?.trim() || cookieToken;

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm md:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Application Status</h1>
          <p className="mt-2 text-sm text-slate-600">
            The status link is missing. Use the link in your acknowledgement email, or contact
            support if you cannot access it.
          </p>
          <div className="mt-6">
            <Link href="/apply" className="text-sm font-medium text-slate-900 underline">
              Back to application form
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const payload = verifyOnboardingStatusToken(token);
  if (!payload) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm md:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Application Status</h1>
          <p className="mt-2 text-sm text-red-700">
            This status link is invalid or expired. Please request a new link from support.
          </p>
        </div>
      </main>
    );
  }

  const application = await prisma.onboardingApplication.findUnique({
    where: { id: payload.applicationId },
    select: {
      id: true,
      business_name: true,
      owner_name: true,
      owner_email: true,
      status: true,
      review_notes: true,
      requested_structure: true,
      requested_allow_employee_self_booking: true,
      requested_manager_can_serve: true,
      created_at: true,
      reviewed_at: true,
      converted_business: {
        select: {
          name: true,
          slug: true,
          // Owner user_id needed to mint a fresh magic-login token if
          // the original SMS / email link expired (1-hour TTL).
          owners: {
            take: 1,
            select: { user_id: true },
          },
        },
      },
    },
  });

  if (!application) {
    notFound();
  }

  if (application.owner_email.toLowerCase() !== payload.ownerEmail) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm md:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Application Status</h1>
          <p className="mt-2 text-sm text-red-700">
            This link does not match the original applicant email.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs uppercase tracking-wide text-slate-500">ServiceFlow</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Application Status</h1>
        <p className="mt-2 text-sm text-slate-600">
          Business: <span className="font-medium text-slate-900">{application.business_name}</span>
        </p>

        <div className="mt-5 flex items-center gap-3">
          <span
            className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold uppercase tracking-wide ${getStatusTone(application.status)}`}
          >
            {application.status}
          </span>
          <span className="text-xs text-slate-500">
            Submitted {application.created_at.toLocaleDateString("en-PH")}
          </span>
        </div>

        <div className="mt-5 space-y-2 rounded-xl border bg-slate-50 p-4 text-sm">
          <p>
            Applicant: <span className="font-medium">{application.owner_name}</span>
          </p>
          <p>
            Email: <span className="font-medium">{application.owner_email}</span>
          </p>
          <p>
            Requested structure:{" "}
            <span className="font-medium">
              {formatBusinessStructureLabel(application.requested_structure)}
            </span>
          </p>
          <p>
            Staff self-booking:{" "}
            <span className="font-medium">
              {application.requested_allow_employee_self_booking ? "Yes" : "No"}
            </span>
          </p>
          <p>
            Manager can serve:{" "}
            <span className="font-medium">
              {application.requested_manager_can_serve ? "Yes" : "No"}
            </span>
          </p>
          {application.reviewed_at ? (
            <p>
              Last review:{" "}
              <span className="font-medium">
                {application.reviewed_at.toLocaleString("en-PH")}
              </span>
            </p>
          ) : null}
          {application.review_notes ? (
            <p>
              Review note: <span className="font-medium">{application.review_notes}</span>
            </p>
          ) : null}
          {application.converted_business ? (
            <p>
              Converted business:{" "}
              <span className="font-medium">
                {application.converted_business.name} ({application.converted_business.slug})
              </span>
            </p>
          ) : null}
        </div>

        {/* Magic-link login — appears once the application is CONVERTED.
            Mints a fresh 1-hour token on every page render so the
            applicant always has a working link, even if their original
            SMS link expired. We rate-limit minting per applicationId so a
            leaked status-token can't pump out unlimited login tokens. */}
        {application.status === "CONVERTED" &&
        application.converted_business &&
        application.converted_business.owners[0]?.user_id ? (
          await (async () => {
            const mintLimit = await rateLimit(
              `apply-status-mint:${application.id}`,
              {
                windowMs: 60 * 60 * 1000,
                maxRequests: 10,
                namespace: "service-flow:apply-status-mint",
              },
            );
            if (!mintLimit.success) {
              return (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="text-sm text-amber-900">
                    You&apos;ve refreshed this page too many times in the last
                    hour. Please wait a few minutes and try again, or use the
                    most recent SMS link sent to your phone.
                  </p>
                </div>
              );
            }
            const ownerUserId =
              application.converted_business?.owners[0]?.user_id;
            const slug = application.converted_business?.slug;
            if (!ownerUserId || !slug) return null;
            const magicHref = `/login/magic?token=${encodeURIComponent(
              createOnboardingLoginToken({
                userId: ownerUserId,
                applicationId: application.id,
              }),
            )}&slug=${encodeURIComponent(slug)}`;
            return (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                  Your account is ready
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-emerald-950">
                  Sign in to {application.converted_business?.name}
                </h2>
                <p className="mt-1 text-sm text-emerald-900/80">
                  Tap the button below to sign in. No password needed — this
                  link is good for the next hour and is single-use. Refresh
                  this page to get a new one if needed.
                </p>
                <Link
                  href={magicHref}
                  className="mt-4 inline-flex h-11 items-center rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-12px_rgba(4,120,87,0.5)] transition-shadow hover:bg-emerald-700/95"
                >
                  Sign in to your dashboard
                </Link>
              </div>
            );
          })()
        ) : null}

        <div className="mt-6">
          <Link href="/apply" className="text-sm font-medium text-slate-900 underline">
            Back to apply page
          </Link>
        </div>
      </div>
    </main>
  );
}

function ApplyStatusFallback() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Application Status</h1>
        <p className="mt-2 text-sm text-slate-600">Loading status details...</p>
      </div>
    </main>
  );
}
