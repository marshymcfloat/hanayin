import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { constructMetadata } from "@/lib/metadata";
import { seoLandingPages } from "@/lib/seo-landing-pages";
import Schema from "@/components/seo/Schema";
import { toAbsoluteUrl } from "@/lib/site-url";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";

export const metadata = constructMetadata({
  title: "Salon, Spa, and Barbershop Software Solutions",
  description:
    "Explore ServiceFlow location and industry solutions for salons, spas, barbershops, and beauty clinics across the Philippines.",
  canonical: "/solutions",
  keywords: [
    "salon software solutions philippines",
    "spa software solutions philippines",
    "barbershop software solutions",
    "beauty clinic software philippines",
    "serviceflow solutions",
  ],
});

export default function SolutionsPage() {
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ServiceFlow Solutions",
    url: toAbsoluteUrl("/solutions"),
    itemListElement: seoLandingPages.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: toAbsoluteUrl(`/solutions/${page.slug}`),
      name: page.title,
    })),
  };

  return (
    <main className="min-h-screen bg-background font-sans flex flex-col">
      <Schema data={itemListSchema} />
      <LandingHeader />

      <section className="container mx-auto px-4 sm:px-6 pt-28 pb-14">
        <div className="max-w-3xl space-y-5">
          <p className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            SEO Solutions Hub
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Location and industry software solutions
          </h1>
          <p className="text-base leading-relaxed text-slate-600 sm:text-lg">
            These pages are designed for high-intent searches across Philippine
            cities and service-business verticals. Each route includes specific
            pain points, workflows, and implementation focus.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 pb-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {seoLandingPages.map((page) => (
            <Link
              key={page.slug}
              href={`/solutions/${page.slug}`}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-300 hover:shadow-lg"
            >
              <p className="mb-3 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <MapPin className="size-3.5 text-green-600" />
                {page.location}
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                {page.headline}
              </h2>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-slate-600">
                {page.description}
              </p>
              <span className="mt-5 inline-flex items-center text-sm font-semibold text-green-700">
                Read solution
                <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
