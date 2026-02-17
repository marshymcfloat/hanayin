import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/prisma/prisma";
import { verifyOnboardingStatusToken } from "@/lib/security/onboarding-status-token";
import { formatBusinessStructureLabel } from "@/lib/business-structure";

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
  const token = params?.token?.trim();

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
        select: { name: true, slug: true },
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
