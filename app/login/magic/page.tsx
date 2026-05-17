"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * Magic-link landing for the onboarding conversion flow. The platform
 * admin's "convert application" action mints a one-time login token,
 * sends it to the new owner via SMS / email, and they land here.
 *
 * Flow:
 *  - Token arrives in `?token=…` (and optionally `?slug=…`).
 *  - We call `signIn("onboarding-magic-link", { token })` — that
 *    provider verifies the HMAC, looks up the User, and creates a
 *    NextAuth session.
 *  - On success: redirect to `/app/{slug}` so the new owner lands on
 *    their business dashboard immediately.
 *  - On failure: show a friendly "link expired" state with a path
 *    back to the application status page (where they can request a
 *    fresh link from the original tokenized URL).
 */
export default function MagicLinkLoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-background p-4 md:p-8">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-black/[0.06] bg-card p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Loader2 className="size-5 animate-spin" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Signing you in
            </p>
          </div>
        </div>
      }
    >
      <MagicLinkLoginInner />
    </React.Suspense>
  );
}

function MagicLinkLoginInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const slug = searchParams.get("slug");

  const [state, setState] = React.useState<
    "verifying" | "success" | "error"
  >("verifying");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // useRef guard: React strict mode double-invokes useEffect during
  // dev, which would fire signIn twice. The guard makes sure we only
  // try once per mount.
  const attempted = React.useRef(false);

  React.useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState("error");
      setErrorMessage("This login link is missing its token.");
      return;
    }

    (async () => {
      try {
        const result = await signIn("onboarding-magic-link", {
          token,
          redirect: false,
        });
        if (!result || result.error || !result.ok) {
          setState("error");
          setErrorMessage(
            "This login link is invalid or has expired. Open your application status page to request a new one.",
          );
          return;
        }
        setState("success");
        // Brief beat so the "logging you in" state is visible — feels
        // less abrupt than immediate redirect.
        setTimeout(() => {
          router.push(slug ? `/app/${slug}` : "/");
        }, 600);
      } catch {
        setState("error");
        setErrorMessage(
          "Something went wrong while signing you in. Please try the link again.",
        );
      }
    })();
  }, [token, slug, router]);

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-background p-4 md:p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-black/[0.06] bg-card p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {state === "verifying" ? (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Loader2 className="size-5 animate-spin" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Signing you in
            </p>
            <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
              One moment, verifying your magic link…
            </h1>
          </>
        ) : null}

        {state === "success" ? (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <CheckCircle2 className="size-5" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Welcome to ServiceFlow
            </p>
            <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
              You&rsquo;re signed in. Taking you to your dashboard…
            </h1>
            <Sparkles className="mt-2 size-4 text-primary" />
          </>
        ) : null}

        {state === "error" ? (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
              <ShieldAlert className="size-5" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Link unavailable
            </p>
            <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
              We couldn&rsquo;t use this login link
            </h1>
            <p className="text-sm text-muted-foreground">
              {errorMessage}
            </p>
            <Button
              asChild
              variant="outline"
              className="mt-2 w-full rounded-2xl border-black/[0.06]"
            >
              <Link href="/apply/status">Open application status</Link>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
