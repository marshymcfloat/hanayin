import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import PainPointsSection from "@/components/landing/PainPointsSection";
import SolutionSection from "@/components/landing/SolutionSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import IndustryUseCasesSection from "@/components/landing/IndustryUseCasesSection";
import GrowthSalesEngineSection from "@/components/landing/GrowthSalesEngineSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import FAQSection from "@/components/landing/FAQSection";
import FinalCTASection from "@/components/landing/FinalCTASection";
import LandingFooter from "@/components/landing/LandingFooter";
import Schema from "@/components/seo/Schema";
import {
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from "@/lib/json-ld";
import { constructMetadata } from "@/lib/metadata";
import { seoLandingPages } from "@/lib/seo-landing-pages";
import Link from "next/link";

import { Suspense } from "react";

export const metadata = constructMetadata({
  title: "Salon & Spa Management Software for Philippine Businesses",
  description:
    "Grow your salon, barbershop, or spa with ServiceFlow. Manage online bookings, payments, payroll, staff schedules, and customer retention in one platform.",
  canonical: "/",
  keywords: [
    "salon management software philippines",
    "spa software philippines",
    "barbershop software philippines",
    "appointment booking software philippines",
    "beauty business management platform",
    "salon scheduling software",
    "salon payroll software",
    "spa point of sale software",
    "salon crm philippines",
    "serviceflow",
  ],
});

export default function Home() {
  const featuredSeoPages = seoLandingPages.slice(0, 3);

  return (
    <main className="min-h-screen w-full bg-background flex flex-col font-sans">
      <Schema data={organizationSchema()} />
      <Schema data={websiteSchema()} />
      <Schema data={softwareApplicationSchema()} />

      <LandingHeader />

      <main className="flex-1 flex flex-col">
        <HeroSection />
        <PainPointsSection />
        <SolutionSection />
        <HowItWorksSection />
        <IndustryUseCasesSection />
        <GrowthSalesEngineSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <section className="container mx-auto px-4 sm:px-6 py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-semibold text-slate-900">
              Popular software solution searches
            </h2>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Explore city and industry pages tailored to how salon, spa, and
              barbershop operators search for management software.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {featuredSeoPages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/solutions/${page.slug}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition-colors hover:border-green-300 hover:bg-green-50"
                >
                  {page.headline}
                </Link>
              ))}
            </div>
            <Link
              href="/solutions"
              className="mt-4 inline-flex text-sm font-semibold text-green-700 hover:text-green-800"
            >
              View all solution pages
            </Link>
          </div>
        </section>
        <FinalCTASection />
      </main>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}
