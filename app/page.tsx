import LandingHeader from "@/components/landing/LandingHeader";
import SmoothScroll from "@/components/landing/SmoothScroll";
import HeroSection from "@/components/landing/HeroSection";
import PainPointsSection from "@/components/landing/PainPointsSection";
import SolutionSection from "@/components/landing/SolutionSection";
import IndustryUseCasesSection from "@/components/landing/IndustryUseCasesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
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
  return (
    <main className="min-h-screen w-full bg-background flex flex-col font-sans">
      <SmoothScroll />
      <Schema data={organizationSchema()} />
      <Schema data={websiteSchema()} />
      <Schema data={softwareApplicationSchema()} />

      <LandingHeader />

      <main className="flex-1 flex flex-col">
        <HeroSection />
        <PainPointsSection />
        <SolutionSection />
        <IndustryUseCasesSection />
        <HowItWorksSection />
        <PricingSection />
        <FAQSection />
        <FinalCTASection />
      </main>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}
