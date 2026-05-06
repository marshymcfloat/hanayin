import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Check } from "lucide-react";

import { createOnboardingApplicationAction } from "@/app/actions/onboarding-applications";
import ApplyStatusBanner from "@/components/forms/ApplyStatusBanner";
import { constructMetadata } from "@/lib/metadata";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import SmoothScroll from "@/components/landing/SmoothScroll";
import AuthDialog from "@/components/auth/AuthDialog";
import { Input } from "@/components/ui/input";
import {
  BUSINESS_STRUCTURE_TEMPLATES,
  normalizeBusinessStructure,
} from "@/lib/business-structure";

export const metadata = constructMetadata({
  title: "Apply for Service Flow",
  description:
    "Apply to onboard your salon, barbershop, or spa to Service Flow. Our team reviews applications within one business day.",
  canonical: "/apply",
  keywords: [
    "apply for salon software",
    "onboard salon to booking platform",
    "spa software onboarding philippines",
    "barbershop software application",
    "serviceflow application form",
  ],
});

const benefits = [
  "Your own booking site at serviceflow.ph/your-name",
  "Bookings, payroll, reminders, CRM — one dashboard",
  "Free data import from your old tools",
  "Local PH support — chat + email, in Filipino or English",
  "14-day free trial. No card. Cancel anytime.",
];

const steps = [
  {
    n: "01",
    title: "Submit application",
    desc: "Tell us about your business below. Takes under 2 minutes.",
  },
  {
    n: "02",
    title: "We review",
    desc: "Within one business day. You'll get an email either way.",
  },
  {
    n: "03",
    title: "Free setup call",
    desc: "We schedule a 30-min call to import your data and configure things.",
  },
  {
    n: "04",
    title: "Go live",
    desc: "Same afternoon. Start taking online bookings immediately.",
  },
];

export default async function ApplyPage() {
  async function submitApplicationFormAction(formData: FormData) {
    "use server";
    const result = await createOnboardingApplicationAction({
      businessName: String(formData.get("businessName") || ""),
      ownerName: String(formData.get("ownerName") || ""),
      ownerEmail: String(formData.get("ownerEmail") || ""),
      ownerPhone: String(formData.get("ownerPhone") || ""),
      notes: String(formData.get("notes") || ""),
      referralCode: String(formData.get("referralCode") || ""),
      requestedStructure: normalizeBusinessStructure(
        formData.get("requestedStructure"),
      ),
      requestedAllowEmployeeSelfBooking:
        String(
          formData.get("requestedAllowEmployeeSelfBooking") || "",
        ).toLowerCase() === "true",
      requestedManagerCanServe:
        String(formData.get("requestedManagerCanServe") || "").toLowerCase() ===
        "true",
    });

    if (!result.success) {
      redirect(`/apply/?error=${encodeURIComponent(result.error)}`);
    }

    const tokenParam = result.statusToken
      ? `&statusToken=${encodeURIComponent(result.statusToken)}`
      : "";
    const emailAckParam = `&emailAck=${result.acknowledgementSent ? "1" : "0"}`;

    redirect(`/apply/?submitted=1${tokenParam}${emailAckParam}`);
  }

  return (
    <main className="min-h-screen bg-background font-sans flex flex-col overflow-x-clip">
      <SmoothScroll />
      <LandingHeader />

      {/* Hero — minimal, mirrors the explore page treatment. */}
      <section className="relative isolate pt-32 pb-10 sm:pt-40 sm:pb-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black_40%,transparent_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-16 -z-10 h-[400px] w-[420px] -translate-x-1/2 rounded-full bg-primary/[0.12] blur-[100px] sm:h-[520px] sm:w-[680px] sm:blur-[120px] lg:h-[600px] lg:w-[900px] lg:blur-[140px]"
        />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
            Apply
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-5xl lg:text-6xl">
            Get your business{" "}
            <span className="bg-gradient-to-br from-primary to-emerald-700 bg-clip-text text-transparent">
              onboarded
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Tell us about your business. We&apos;ll review within one business
            day and have you live the same afternoon.
          </p>
        </div>
      </section>

      {/* Two-column body */}
      <section className="relative pb-24 sm:pb-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
            {/* LEFT — value props + steps. Sticky on lg. */}
            <aside className="lg:sticky lg:top-28 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
              {/* What you get */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  What you get
                </p>
                <ul className="mt-5 space-y-3">
                  {benefits.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-3 text-sm text-foreground/85 sm:text-base"
                    >
                      <span
                        aria-hidden
                        className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What happens next */}
              <div className="mt-12">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  What happens next
                </p>
                <ol className="relative mt-5 space-y-5 border-l border-black/[0.06] pl-5">
                  {steps.map((step, i) => (
                    <li key={step.n} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-[27px] top-0.5 inline-flex size-4 items-center justify-center rounded-full border border-black/[0.08] bg-white font-mono text-[8px] font-semibold tracking-[0.05em] text-primary"
                      >
                        {String(i + 1).padStart(2, "0").slice(-1)}
                      </span>
                      <div className="text-sm font-medium tracking-[-0.005em] text-foreground sm:text-base">
                        {step.title}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                        {step.desc}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Help nudge */}
              <div className="mt-12 rounded-xl border border-black/[0.06] bg-zinc-50/50 p-4 text-sm">
                <p className="font-medium text-foreground">
                  Have questions?
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Reach us at{" "}
                  <a
                    href="mailto:hello@serviceflow.ph"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    hello@serviceflow.ph
                  </a>
                  .
                </p>
              </div>
            </aside>

            {/* RIGHT — form card */}
            <div>
              <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.06)] sm:p-7">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                    Application form
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">
                    Tell us about your business
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    All fields marked required. Takes about 2 minutes.
                  </p>
                </div>

                <Suspense fallback={null}>
                  <ApplyStatusBanner />
                </Suspense>

                <form
                  action={submitApplicationFormAction}
                  className="mt-6 space-y-5"
                >
                  {/* Business identity */}
                  <FormField label="Business name" required>
                    <Input
                      name="businessName"
                      placeholder="e.g. Glow Up Salon"
                      required
                      className="h-10 bg-white"
                    />
                  </FormField>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Owner name" required>
                      <Input
                        name="ownerName"
                        placeholder="Your full name"
                        required
                        className="h-10 bg-white"
                      />
                    </FormField>
                    <FormField label="Owner email" required>
                      <Input
                        name="ownerEmail"
                        type="email"
                        placeholder="you@company.com"
                        required
                        className="h-10 bg-white"
                      />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Phone number" hint="Optional">
                      <Input
                        name="ownerPhone"
                        placeholder="+63 900 000 0000"
                        className="h-10 bg-white"
                      />
                    </FormField>
                    <FormField label="Referral code" hint="Optional">
                      <Input
                        name="referralCode"
                        placeholder="Partner code"
                        className="h-10 bg-white"
                      />
                    </FormField>
                  </div>

                  <FormField
                    label="Business details"
                    hint="What you do, branches, anything specific"
                  >
                    <textarea
                      name="notes"
                      placeholder="Tell us about your business, how many branches you have, or any specific needs…"
                      rows={4}
                      className="w-full rounded-md border border-black/[0.10] bg-white px-3 py-2 text-sm placeholder:text-muted-foreground/70 transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 resize-none"
                    />
                  </FormField>

                  {/* Setup section divider */}
                  <div className="flex items-center gap-3 pt-2">
                    <div className="h-px flex-1 bg-black/[0.06]" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Setup preferences
                    </p>
                    <div className="h-px flex-1 bg-black/[0.06]" />
                  </div>

                  <FormField
                    label="Business structure"
                    hint="Helps us configure your initial workflow."
                  >
                    <select
                      name="requestedStructure"
                      defaultValue="OWNER_EMPLOYEE_SELF_SERVICE"
                      className="h-10 w-full rounded-md border border-black/[0.10] bg-white px-3 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                    >
                      {BUSINESS_STRUCTURE_TEMPLATES.map((template) => (
                        <option key={template.value} value={template.value}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Allow staff self-booking">
                      <select
                        name="requestedAllowEmployeeSelfBooking"
                        defaultValue="true"
                        className="h-10 w-full rounded-md border border-black/[0.10] bg-white px-3 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </FormField>
                    <FormField label="Manager can serve">
                      <select
                        name="requestedManagerCanServe"
                        defaultValue="true"
                        className="h-10 w-full rounded-md border border-black/[0.10] bg-white px-3 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </FormField>
                  </div>

                  <button
                    type="submit"
                    className="group mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background shadow-[0_1px_0_rgba(255,255,255,0.1)_inset,0_1px_3px_rgba(0,0,0,0.2)] transition-all hover:bg-foreground/90 active:scale-[0.99]"
                  >
                    Submit application
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>

                  <p className="text-center text-xs text-muted-foreground">
                    By submitting, you agree to our{" "}
                    <Link
                      href="/terms"
                      className="text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              </div>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <AuthDialog>
                  <button
                    type="button"
                    className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Sign in
                  </button>
                </AuthDialog>
              </p>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Reusable field wrapper                                                     */
/* -------------------------------------------------------------------------- */

function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold tracking-[-0.005em] text-foreground">
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </label>
        {hint && !required && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
      {hint && required && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
