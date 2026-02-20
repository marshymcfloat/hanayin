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
import { organizationSchema, websiteSchema } from "@/lib/json-ld";

import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-background flex flex-col font-sans">
      <Schema data={organizationSchema()} />
      <Schema data={websiteSchema()} />

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
        <FinalCTASection />
      </main>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}
