"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";

import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import AuthForm from "./AuthForm";

/**
 * AuthDialog — sign-in modal.
 *
 * Visuals match the marketing redesign:
 *   - Mobile (< md): clean white card anchored to the top, sits above the
 *     on-screen keyboard via a visualViewport-aware position. The dialog
 *     re-centers on the *visible* region whenever the keyboard opens, so
 *     inputs are never hidden behind the keyboard on iOS / Android.
 *   - Desktop (≥ md): editorial split — dark left rail with brand mark,
 *     headline, three live stats, mono footer; right rail holds the form.
 *
 * The Radix Dialog primitive's default DialogContent centers via
 * top:50% / translate -50%, which sits relative to the *layout* viewport
 * and goes behind the keyboard. We re-implement Content here so we can
 * set `top: calc(var(--vvy) + var(--vvh) / 2)` from the visual viewport
 * hook (see hooks/use-visual-viewport.ts).
 */
export default function AuthDialog({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        {children || (
          <Button
            size="lg"
            className="cursor-pointer rounded-full bg-foreground px-6 text-sm font-medium text-background hover:bg-foreground/90"
          >
            Get started
          </Button>
        )}
      </DialogPrimitive.Trigger>
      <AuthDialogContent />
    </DialogPrimitive.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

function AuthDialogContent() {
  // Update --vvh / --vvy on <html> so the dialog can re-center over the
  // visible viewport when the on-screen keyboard pops up. Activates only
  // while the dialog is mounted (i.e. open).
  useVisualViewport(true);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        )}
      />

      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          // Layered positioning:
          //   • Mobile: anchor the dialog's vertical center to the
          //     center of the *visual* viewport. When the keyboard
          //     opens, --vvh shrinks and --vvy may change, and the
          //     dialog re-centers over the visible region.
          //   • Desktop: fall back to layout-viewport centering (sm:).
          "fixed left-1/2 z-50 -translate-x-1/2",
          "top-[calc(var(--vvy,0px)+max(8px,(var(--vvh,100dvh)-var(--auth-h,560px))/2))]",
          "sm:top-1/2 sm:-translate-y-1/2 sm:[--auth-h:auto]",
          // Sizing
          "w-[calc(100%-1rem)] max-w-md",
          "md:max-w-4xl lg:max-w-5xl",
          "max-h-[calc(var(--vvh,100dvh)-1rem)] sm:max-h-[min(660px,calc(100dvh-2rem))]",
          // Surface
          "overflow-hidden rounded-2xl border border-black/[0.06] bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-20px_rgba(0,0,0,0.25)]",
          // Animations
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "duration-200",
        )}
        // Capture the actual rendered height into --auth-h so the
        // calc() above can subtract it cleanly. JS-free fallback used
        // before mount: 560px (a sensible mid-size).
        style={{ outline: "none" }}
      >
        <div className="grid h-full w-full grid-cols-1 md:grid-cols-[5fr_7fr] md:min-h-[560px]">
          <BrandRail />
          <FormRail />
        </div>

        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-3 top-3 z-20 inline-flex size-8 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/[0.06] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:right-4 md:top-4"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* -------------------------------------------------------------------------- */
/* Left rail (desktop only) — editorial brand panel                            */
/* -------------------------------------------------------------------------- */

// Tiny SVG noise generator inlined as a data URL. Mirrors the grain
// overlay used on the marketing FinalCTASection so the dialog's left
// rail and the page-end CTA share the same surface treatment.
const NOISE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  );

function BrandRail() {
  return (
    <aside
      aria-hidden="true"
      className="relative isolate hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-emerald-700 to-emerald-900 p-8 text-white md:flex lg:p-10"
    >
      {/* Grain overlay — purely decorative, matches FinalCTASection */}
      <div
        style={{ backgroundImage: `url("${NOISE_SVG}")` }}
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
      />

      {/* Soft white radial highlight at top-left for depth */}
      <div className="pointer-events-none absolute -top-24 -left-10 size-[420px] rounded-full bg-white/10 blur-[120px]" />

      {/* Faint diagonal hairline grid, masked to the center */}
      <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_75%_70%_at_40%_40%,black_30%,transparent_100%)]" />

      {/* Brand mark */}
      <div className="relative flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-md bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
          <div className="size-3 rounded-sm bg-white" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-white">
          ServiceFlow
        </span>
      </div>

      {/* Headline + intro */}
      <div className="relative space-y-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium tracking-tight text-emerald-50 backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-emerald-200" />
          Operations console
        </span>
        <h3 className="text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-white lg:text-[40px]">
          Welcome back to <br />
          your command desk.
        </h3>
        <p className="max-w-[36ch] text-sm leading-relaxed text-emerald-50/90">
          Bookings, payroll, reports, and growth campaigns — one signed-in
          surface, designed for the Philippine beauty industry.
        </p>
      </div>

      {/* Bottom note — same value props the marketing CTA already states,
          so nothing here is unverified. */}
      <p className="relative border-t border-white/15 pt-6 text-xs text-emerald-100/80">
        14-day trial · No credit card required · Free setup help
      </p>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Right rail — form                                                          */
/* -------------------------------------------------------------------------- */

function FormRail() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <div
        className={cn(
          // Inner container is the only scrollable region — keyboard
          // can push focus around within it without breaking layout.
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-7 sm:px-7 sm:py-9 md:px-10 md:py-12 lg:px-12",
        )}
        data-lenis-prevent
      >
        {/* Mobile-only brand mark, since the BrandRail is hidden < md */}
        <div className="mb-6 flex items-center gap-2 md:hidden">
          <div className="grid size-6 place-items-center rounded-md bg-foreground ring-1 ring-inset ring-foreground/10">
            <div className="size-2.5 rounded-sm bg-background" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            ServiceFlow
          </span>
        </div>

        <div className="space-y-1.5">
          <DialogPrimitive.Title className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-foreground sm:text-[28px] lg:text-[32px]">
            Sign in
          </DialogPrimitive.Title>
          <p className="text-sm text-foreground/60">
            Enter your credentials to access your workspace.
          </p>
        </div>

        <div className="mt-7">
          <AuthForm />
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-black/[0.06] pt-5 text-sm text-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <span>New to ServiceFlow?</span>
          <Link
            href="/apply"
            className="group inline-flex items-center gap-1.5 font-medium text-foreground transition hover:text-primary"
          >
            Apply for an account
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
