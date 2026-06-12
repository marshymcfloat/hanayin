import { Suspense } from "react";

import LandingHeader from "@/components/landing/LandingHeader";
import SmoothScroll from "@/components/landing/SmoothScroll";
import LandingFooter from "@/components/landing/LandingFooter";
import FinalCTASection from "@/components/landing/FinalCTASection";
import AboutHeroSection from "@/components/about/AboutHeroSection";
import OriginSection from "@/components/about/OriginSection";
import PrinciplesSection from "@/components/about/PrinciplesSection";
import FounderNoteSection from "@/components/about/FounderNoteSection";
import ContactSection from "@/components/about/ContactSection";
import Schema from "@/components/seo/Schema";
import { breadcrumbSchema, organizationSchema } from "@/lib/json-ld";
import { constructMetadata } from "@/lib/metadata";

export const metadata = constructMetadata({
  title: "About ServiceFlow",
  description:
    "Meet the team behind ServiceFlow and learn how we help salons, barbershops, and spas in the Philippines run their floors better.",
  canonical: "/about",
  keywords: [
    "about serviceflow",
    "philippines salon software company",
    "spa management platform team",
    "barbershop technology philippines",
  ],
});

export default function AboutPage() {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col font-sans">
      <SmoothScroll />
      <Schema data={organizationSchema()} />
      <Schema
        data={breadcrumbSchema([
          { name: "Home", item: "/" },
          { name: "About", item: "/about" },
        ])}
      />
      <LandingHeader />

      <main className="flex-1 flex flex-col">
        <AboutHeroSection />
        <OriginSection />
        <PrinciplesSection />
        <FounderNoteSection />
        <ContactSection />
        <FinalCTASection />
      </main>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </div>
  );
}
