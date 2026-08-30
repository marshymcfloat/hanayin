import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck2,
  ChartNoAxesCombined,
  ShieldCheck,
} from "lucide-react";

import AuthForm from "@/components/auth/AuthForm";
import { constructMetadata } from "@/lib/metadata";

export const metadata = constructMetadata({
  title: "Sign in",
  description: "Sign in to your ServiceFlow workspace.",
  canonical: "/login",
  noIndex: true,
});

const workspaceHighlights = [
  {
    icon: CalendarCheck2,
    title: "Stay ahead of the day",
    description: "Bookings, queues, and staff schedules in one calm view.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Know what is working",
    description: "See sales, services, and team performance without the noise.",
  },
  {
    icon: ShieldCheck,
    title: "One secure workspace",
    description: "Role-based access keeps every team member in the right lane.",
  },
];

export default function LoginPage() {
  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-background px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.055)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_80%_75%_at_50%_45%,black_25%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-12rem] top-[-14rem] -z-10 size-[34rem] rounded-full bg-primary/12 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-18rem] right-[-12rem] -z-10 size-[38rem] rounded-full bg-emerald-200/25 blur-[120px]"
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <Link
          href="/"
          aria-label="ServiceFlow home"
          className="relative block h-11 w-36 sm:h-12 sm:w-40"
        >
          <Image
            src="/serviceFlow_logo_no_bg.png"
            alt="ServiceFlow"
            fill
            priority
            sizes="160px"
            className="object-contain object-left"
          />
        </Link>
        <Link
          href="/"
          className="group inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-foreground/65 transition-colors duration-200 hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          <span className="hidden sm:inline">Back to home</span>
          <span className="sm:hidden">Back</span>
        </Link>
      </header>

      <section className="mx-auto flex min-h-[calc(100svh-6.75rem)] w-full max-w-6xl items-center py-7 sm:py-10">
        <div className="grid w-full overflow-hidden rounded-[1.75rem] border border-black/[0.07] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_28px_80px_-32px_rgba(0,0,0,0.24)] backdrop-blur-sm md:grid-cols-[1.08fr_0.92fr] lg:min-h-[650px]">
          <aside className="relative isolate hidden overflow-hidden bg-gradient-to-br from-primary via-emerald-700 to-emerald-950 p-10 text-white md:flex md:flex-col md:justify-between lg:p-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:38px_38px] [mask-image:radial-gradient(ellipse_80%_75%_at_42%_42%,black_25%,transparent_100%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 -top-28 -z-10 size-[28rem] rounded-full bg-white/12 blur-[100px]"
            />

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-emerald-50 backdrop-blur-sm">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-200 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-200" />
                </span>
                Your workspace is ready
              </div>

              <h1 className="mt-7 max-w-lg text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.025em] text-white lg:text-5xl">
                Pick up where your business left off.
              </h1>
              <p className="mt-5 max-w-md text-pretty text-sm leading-6 text-emerald-50/80 lg:text-base lg:leading-7">
                Return to the daily rhythm of your salon or spa—without losing
                sight of the details that keep it moving.
              </p>
            </div>

            <div className="relative space-y-2">
              {workspaceHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.065] p-3.5 backdrop-blur-sm"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-emerald-50 ring-1 ring-inset ring-white/10">
                      <Icon className="size-[18px]" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-white">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-emerald-100/70">
                        {item.description}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="flex items-center px-5 py-9 sm:px-10 sm:py-12 lg:px-14">
            <div className="mx-auto w-full max-w-[25rem]">
              <div className="mb-8 md:hidden">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-800">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Your workspace is ready
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Welcome back
                </p>
                <h2 className="mt-3 text-balance text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2.35rem]">
                  Sign in to ServiceFlow
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                  Use the contact number and password connected to your
                  workspace.
                </p>
              </div>

              <div className="mt-8">
                <AuthForm />
              </div>

              <div className="mt-8 flex flex-col gap-3 border-t border-black/[0.07] pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">
                  New to ServiceFlow?
                </span>
                <Link
                  href="/apply"
                  className="group inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  Apply for an account
                  <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>

              <p className="mt-6 text-xs leading-5 text-muted-foreground">
                Temporary password? Sign in with the code from your invite SMS.
                You will be asked to secure your account after signing in.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
