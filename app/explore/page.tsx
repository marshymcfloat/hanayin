import { prisma } from "@/prisma/prisma";
import Link from "next/link";
import { ArrowRight, MapPin, Search, Sparkles } from "lucide-react";
import Image from "next/image";
import { connection } from "next/server";
import { Suspense } from "react";
import { constructMetadata } from "@/lib/metadata";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import { Badge } from "@/components/ui/badge";

export const metadata = constructMetadata({
  title: "Explore Businesses | Service Flow",
  description:
    "Browse trusted local businesses using Service Flow for their appointments and management.",
  image: "/og-image.png",
  canonical: "/explore",
  keywords: [
    "find salons in philippines",
    "book spa near me philippines",
    "discover barbershops online",
    "beauty services marketplace",
    "serviceflow business directory",
  ],
});

export default function ExplorePage() {
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

        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16 space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <Badge
              variant="outline"
              className="rounded-full px-4 py-1.5 border-green-200 bg-green-50/50 text-green-700 gap-2 hover:bg-green-100 transition-colors cursor-default backdrop-blur-sm mx-auto"
            >
              <Sparkles className="size-3.5" />
              Discover Local Gems
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
              Find the perfect{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-green-600 to-teal-500">
                service
              </span>
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl mx-auto">
              Book appointments with top-rated salons, barbershops, and spas
              across the Philippines.
            </p>
          </div>

          <Suspense fallback={<BusinessListSkeleton />}>
            <BusinessList />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}

async function BusinessList() {
  await connection();

  const businesses = await prisma.business.findMany({
    where: {
      subscriptions: {
        some: {
          status: {
            notIn: ["SUSPENDED", "CANCELED"],
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      initials: true,
      imageUrl: true,
      description: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  if (businesses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white/50 backdrop-blur-sm rounded-3xl border border-dashed border-slate-300 animate-in fade-in duration-700">
        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
          <Search className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">
          No businesses found
        </h3>
        <p className="text-slate-500 max-w-sm mt-2">
          We couldn&apos;t find any businesses listed publicly yet. Check back
          soon!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
      {businesses.map((business) => (
        <Link
          key={business.id}
          href={`/${business.slug}`}
          className="group relative flex flex-col bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl hover:border-green-200 transition-all duration-300 hover:-translate-y-1 h-full"
        >
          {/* Decorative Pattern Header */}
          <div className="h-32 bg-linear-to-br from-green-50 via-emerald-50 to-teal-50 relative overflow-hidden group-hover:from-green-100 group-hover:via-emerald-100 group-hover:to-teal-100 transition-colors duration-500">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--tw-gradient-stops))] from-white/40 to-transparent" />
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-green-200/30 rounded-full blur-2xl group-hover:bg-green-300/40 transition-colors duration-500" />
          </div>

          <div className="px-6 pb-6 flex-1 flex flex-col relative">
            {/* Floating Avatar */}
            <div className="-mt-10 mb-4 inline-flex">
              <div className="h-20 w-20 rounded-2xl bg-white p-1.5 shadow-md shadow-slate-200 ring-1 ring-slate-100 overflow-hidden relative group-hover:scale-105 transition-transform duration-300">
                {business.imageUrl ? (
                  <Image
                    src={business.imageUrl}
                    alt={business.name}
                    fill
                    sizes="80px"
                    className="rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-full w-full rounded-xl bg-linear-to-br from-green-500 to-teal-600 flex items-center justify-center text-2xl font-bold text-white shadow-inner">
                    {business.initials}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-green-700 transition-colors line-clamp-1">
                  {business.name}
                </h3>
                <div className="flex items-center text-sm font-medium text-slate-500 mt-1">
                  <MapPin className="size-3.5 mr-1.5 text-green-500/80" />
                  Philippines
                </div>
                {business.description && (
                  <p className="text-sm text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                    {business.description}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Badge
                  variant="secondary"
                  className="bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200 font-medium"
                >
                  Service Provider
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200 font-medium"
                >
                  Verified
                </Badge>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-sm group/btn">
              <span className="text-slate-500 group-hover:text-green-600 transition-colors font-medium">
                View Profile
              </span>
              <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-all duration-300">
                <ArrowRight className="size-4" />
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function BusinessListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm h-[320px] animate-pulse"
        >
          <div className="h-32 bg-slate-100" />
          <div className="px-6 pb-6 relative">
            <div className="-mt-10 mb-4 h-20 w-20 rounded-2xl bg-slate-200 border-4 border-white" />
            <div className="space-y-3">
              <div className="h-6 w-3/4 bg-slate-200 rounded" />
              <div className="h-4 w-1/2 bg-slate-200 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
