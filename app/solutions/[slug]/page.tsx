import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { constructMetadata } from "@/lib/metadata";
import {
  getSeoLandingPageBySlug,
  seoLandingPages,
} from "@/lib/seo-landing-pages";
import Schema from "@/components/seo/Schema";
import { breadcrumbSchema } from "@/lib/json-ld";
import { toAbsoluteUrl } from "@/lib/site-url";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return seoLandingPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoLandingPageBySlug(slug);

  if (!page) {
    return constructMetadata({
      title: "Solution Not Found",
      description: "This solution page is not available.",
      canonical: "/solutions",
      noIndex: true,
    });
  }

  return constructMetadata({
    title: page.title,
    description: page.description,
    canonical: `/solutions/${page.slug}`,
    keywords: page.focusKeywords,
  });
}

export default async function SolutionDetailPage({ params }: Props) {
  const { slug } = await params;
  const page = getSeoLandingPageBySlug(slug);

  if (!page) {
    notFound();
  }

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.title,
    serviceType: `${page.industry} management software`,
    areaServed: page.location,
    description: page.description,
    provider: {
      "@type": "Organization",
      name: "ServiceFlow",
      url: toAbsoluteUrl("/"),
    },
    url: toAbsoluteUrl(`/solutions/${page.slug}`),
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const breadcrumb = breadcrumbSchema([
    { name: "Home", item: "/" },
    { name: "Solutions", item: "/solutions" },
    { name: page.headline, item: `/solutions/${page.slug}` },
  ]);

  return (
    <main className="min-h-screen bg-background font-sans flex flex-col">
      <Schema data={serviceSchema} />
      <Schema data={faqSchema} />
      <Schema data={breadcrumb} />
      <LandingHeader />

      <section className="container mx-auto px-4 sm:px-6 pt-28 pb-10">
        <div className="max-w-4xl space-y-5">
          <p className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            {page.location} {page.industry} Solution
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {page.headline}
          </h1>
          <p className="text-base leading-relaxed text-slate-600 sm:text-lg">
            {page.description}
          </p>
          <div className="flex flex-wrap gap-2">
            {page.focusKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto grid gap-6 px-4 pb-20 sm:px-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">
            Common operational challenges
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {page.painPoints.map((point) => (
              <li key={point} className="flex gap-2 leading-relaxed">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">
            How ServiceFlow helps
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {page.capabilities.map((capability) => (
              <li key={capability} className="flex gap-2 leading-relaxed">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700" />
                <span>{capability}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Ideal for</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {page.idealFor.map((segment) => (
              <li key={segment} className="flex gap-2 leading-relaxed">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-blue-700" />
                <span>{segment}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">
            Frequently asked questions
          </h2>
          <div className="mt-4 space-y-4">
            {page.faqs.map((faq) => (
              <div key={faq.question} className="rounded-xl bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  {faq.question}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="container mx-auto px-4 pb-20 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-semibold text-slate-900">
            Ready to improve your {page.industry.toLowerCase()} operations?
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            ServiceFlow is built for Philippine service businesses that need
            clean workflows from booking to staff operations. Start with the
            onboarding process, or review live businesses using the platform.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/apply"
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Apply to ServiceFlow
              <ArrowRight className="ml-2 size-4" />
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Explore businesses
            </Link>
            <Link
              href="/solutions"
              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              View all solutions
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
