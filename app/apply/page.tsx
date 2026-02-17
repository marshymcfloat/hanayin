import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

import { createOnboardingApplicationAction } from "@/app/actions/onboarding-applications";
import ApplyStatusBanner from "@/components/forms/ApplyStatusBanner";
import { constructMetadata } from "@/lib/metadata";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BUSINESS_STRUCTURE_TEMPLATES,
  normalizeBusinessStructure,
} from "@/lib/business-structure";

export const metadata = constructMetadata({
  title: "Apply for Service Flow",
  description:
    "Apply to onboard your salon, barbershop, or spa to Service Flow. Our team reviews applications within one business day.",
  canonical: "/apply",
});

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
        String(formData.get("requestedAllowEmployeeSelfBooking") || "").toLowerCase() ===
        "true",
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
    <main className="min-h-screen bg-background font-sans flex flex-col">
      <LandingHeader />

      <div className="flex-1 relative pt-32 pb-20">
        {/* Background Gradients */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-size-[24px_24px]" />
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)`,
          }}
        />

        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Value Proposition Column */}
            <div className="hidden lg:flex flex-col space-y-8 sticky top-32 animate-in fade-in slide-in-from-left-8 duration-700">
              <div className="space-y-4">
                <Badge
                  variant="outline"
                  className="w-fit rounded-full px-4 py-1.5 border-green-200 bg-green-50/50 text-green-700 gap-2 hover:bg-green-100 transition-colors cursor-default backdrop-blur-sm"
                >
                  <Sparkles className="size-3.5" />
                  Join 100+ Local Businesses
                </Badge>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                  Start your journey with{" "}
                  <span className="text-transparent bg-clip-text bg-linear-to-r from-green-600 to-teal-500">
                    ServiceFlow
                  </span>
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
                  Join the fastest-growing platform for beauty and wellness
                  businesses in the Philippines. Streamline your operations and
                  grow your revenue today.
                </p>
              </div>

              <div className="space-y-6">
                {[
                  "Get listed on our marketplace",
                  "Manage appointments & walk-ins",
                  "Automated SMS reminders",
                  "Point of Sale (POS) system",
                  "Employee commission tracking",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-4 group">
                    <div className="shrink-0 size-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors duration-300">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <span className="text-slate-700 font-medium group-hover:text-green-700 transition-colors">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-1 text-amber-500 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className="size-4 fill-current"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="italic text-slate-700 mb-4">
                    &quot;ServiceFlow has completely transformed how run my
                    salon. The automated reminders alone have reduced no-shows
                    by 80%.&quot;
                  </p>
                  <p className="font-semibold text-slate-900">
                    - Sarah J., Salon Owner
                  </p>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-200/20 rounded-full blur-3xl -mr-16 -mt-16" />
              </div>
            </div>

            {/* Form Column */}
            <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-6 md:p-8 relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-linear-to-br from-green-100/50 to-transparent rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

                <div className="relative z-10">
                  <div className="mb-6 md:mb-8 text-center lg:text-left">
                    <p className="text-sm uppercase tracking-wider text-green-600 font-semibold mb-2">
                      Application Form
                    </p>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
                      Get Your Business Onboarded
                    </h2>
                    <p className="mt-2 text-slate-600">
                      Fill out the details below. We typically review
                      applications within 24 hours.
                    </p>
                  </div>

                  <Suspense fallback={null}>
                    <ApplyStatusBanner />
                  </Suspense>

                  <form
                    action={submitApplicationFormAction}
                    className="space-y-5 mt-6"
                  >
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 ml-1">
                          Business Name
                        </label>
                        <Input
                          name="businessName"
                          placeholder="e.g. Glow Up Salon"
                          required
                          className="bg-white/50 backdrop-blur-sm h-11 text-base border-slate-200 focus:border-green-500 focus:ring-green-500/20"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 ml-1">
                            Owner Name
                          </label>
                          <Input
                            name="ownerName"
                            placeholder="Your full name"
                            required
                            className="bg-white/50 backdrop-blur-sm h-11 text-base border-slate-200 focus:border-green-500 focus:ring-green-500/20"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 ml-1">
                            Owner Email
                          </label>
                          <Input
                            name="ownerEmail"
                            type="email"
                            placeholder="you@company.com"
                            required
                            className="bg-white/50 backdrop-blur-sm h-11 text-base border-slate-200 focus:border-green-500 focus:ring-green-500/20"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 ml-1">
                            Phone Number (Optional)
                          </label>
                          <Input
                            name="ownerPhone"
                            placeholder="+63 900 000 0000"
                            className="bg-white/50 backdrop-blur-sm h-11 text-base border-slate-200 focus:border-green-500 focus:ring-green-500/20"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 ml-1">
                            Referral Code (Optional)
                          </label>
                          <Input
                            name="referralCode"
                            placeholder="Partner code"
                            className="bg-white/50 backdrop-blur-sm h-11 text-base border-slate-200 focus:border-green-500 focus:ring-green-500/20"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 ml-1">
                          Business Details / Notes
                        </label>
                        <textarea
                          name="notes"
                          placeholder="Tell us about your business, how many branches you have, or any specific needs..."
                          rows={4}
                          className="w-full rounded-md border border-slate-200 bg-white/50 backdrop-blur-sm px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/20 focus-visible:border-green-500 transition-colors resize-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 ml-1">
                          Business Structure
                        </label>
                        <select
                          name="requestedStructure"
                          defaultValue="OWNER_EMPLOYEE_SELF_SERVICE"
                          className="w-full rounded-md border border-slate-200 bg-white/50 backdrop-blur-sm px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/20 focus-visible:border-green-500 transition-colors"
                        >
                          {BUSINESS_STRUCTURE_TEMPLATES.map((template) => (
                            <option key={template.value} value={template.value}>
                              {template.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500 ml-1">
                          This helps us configure your initial workflow during onboarding.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 ml-1">
                            Allow Staff Self-booking
                          </label>
                          <select
                            name="requestedAllowEmployeeSelfBooking"
                            defaultValue="true"
                            className="w-full rounded-md border border-slate-200 bg-white/50 backdrop-blur-sm px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/20 focus-visible:border-green-500 transition-colors"
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 ml-1">
                            Manager Can Serve
                          </label>
                          <select
                            name="requestedManagerCanServe"
                            defaultValue="true"
                            className="w-full rounded-md border border-slate-200 bg-white/50 backdrop-blur-sm px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/20 focus-visible:border-green-500 transition-colors"
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-semibold rounded-xl bg-linear-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-px"
                    >
                      Submit Application <ArrowRight className="ml-2 size-4" />
                    </Button>

                    <p className="text-center text-xs text-slate-500 mt-4">
                      By submitting, you agree to our Terms of Service and
                      Privacy Policy.
                    </p>
                  </form>
                </div>
              </div>

              <div className="mt-8 text-center bg-white/40 backdrop-blur-md rounded-2xl p-4 border border-white/50 shadow-sm">
                <p className="text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link
                    href="/"
                    className="font-semibold text-green-700 hover:text-green-800 hover:underline"
                  >
                    Sign in here
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}
