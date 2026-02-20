import Link from "next/link";
import { ArrowRight, Facebook, Mail, Sparkles } from "lucide-react";
import { Suspense } from "react";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { constructMetadata } from "@/lib/metadata";

export const metadata = constructMetadata({
  title: "About ServiceFlow",
  description:
    "Meet the team behind ServiceFlow and learn how we help salons, barbershops, and spas in the Philippines grow with better booking operations.",
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

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          {/* Hero Section */}
          <div className="text-center mb-20 space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <Badge
              variant="outline"
              className="rounded-full px-4 py-1.5 border-green-200 bg-green-50/50 text-green-700 gap-2 hover:bg-green-100 transition-colors cursor-default backdrop-blur-sm mx-auto"
            >
              <Sparkles className="size-3.5" />
              Our Story
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
              Building a{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-green-600 to-teal-500">
                Big Dream
              </span>
            </h1>
            <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              ServiceFlow started with a simple idea: to make booking services
              as easy as flowing water.
            </p>
          </div>

          {/* Story + Contact Section */}
          <div className="grid md:grid-cols-2 gap-12 items-start mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            <div className="space-y-6 text-lg text-slate-600 leading-relaxed">
              <p>
                Hi, I&apos;m{" "}
                <span className="font-semibold text-slate-900">
                  Daniel Canoy
                </span>
                .
              </p>
              <p>
                I&apos;m a Full Stack Developer with a passion for building
                tools that help people. ServiceFlow is currently a two-person
                team—just me and my friend—working hard to turn a big dream into
                reality.
              </p>
              <p>
                We believe that small businesses in the Philippines deserve
                world-class tools to manage their appointments and customers. We
                are building this platform from the ground up, pouring our
                hearts into every line of code to support your business journey.
              </p>
              <p>Thank you for being part of our story.</p>

              <div className="pt-4">
                <Link href="/apply">
                  <Button className="h-12 px-6 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all font-medium text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                    Join ServiceFlow
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-linear-to-br from-green-200/40 to-teal-200/40 rounded-3xl blur-3xl -z-10 rotate-3" />
              <div className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-3xl p-8 shadow-xl">
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-slate-900">
                    Get in Touch
                  </h3>
                  <p className="text-slate-600">
                    Have questions, feedback, or just want to say hi? We&apos;d
                    love to hear from you.
                  </p>

                  <div className="space-y-4">
                    <a
                      href="mailto:canoydaniel06@gmail.com"
                      className="flex items-center p-4 bg-white rounded-xl border border-slate-100 hover:border-green-200 hover:shadow-md transition-all group"
                    >
                      <div className="h-10 w-10 bg-green-50 rounded-full flex items-center justify-center mr-4 group-hover:bg-green-100 transition-colors shrink-0">
                        <Mail className="size-5 text-green-600" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Email Us
                        </div>
                        <div className="font-medium text-slate-900">
                          canoydaniel06@gmail.com
                        </div>
                      </div>
                    </a>

                    <a
                      href="https://web.facebook.com/RosesRBlacc"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center p-4 bg-white rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all group"
                    >
                      <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center mr-4 group-hover:bg-blue-100 transition-colors shrink-0">
                        <Facebook className="size-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Facebook
                        </div>
                        <div className="font-medium text-slate-900">
                          Daniel Canoy
                        </div>
                      </div>
                    </a>
                  </div>
                </div>
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
