import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CalendarPlus,
  CheckCircle2,
  Home,
  ArrowRight,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Metadata } from "next";
import { Suspense } from "react";
import { prisma } from "@/prisma/prisma";
import {
  PortalCard,
  PortalCardBody,
  PortalCardHeader,
} from "@/components/dashboard/employee/portal/PortalCard";
import {
  BOOKING_MANAGE_TOKEN_TTL_SECONDS,
  createBookingSuccessToken,
  verifyBookingSuccessToken,
} from "@/lib/security/booking-success-token";
import { getBookingPaymentDisplay } from "@/lib/utils/booking-payment-display";

type BookingSuccessSearchParams = {
  bookingId?: string | string[];
  token?: string | string[];
};

const formatIcsDate = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const escapeIcsText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

export const metadata: Metadata = {
  title: "Booking Confirmed | Service Flow",
  description:
    "Your booking is confirmed. Thank you for choosing Service Flow.",
  robots: {
    index: false,
    follow: false,
  },
};

async function BookingSuccessContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<BookingSuccessSearchParams>;
}) {
  const { businessSlug } = await params;
  const resolvedSearchParams = await searchParams;

  const bookingIdParam = Array.isArray(resolvedSearchParams?.bookingId)
    ? resolvedSearchParams?.bookingId[0]
    : resolvedSearchParams?.bookingId;
  const tokenParam = Array.isArray(resolvedSearchParams?.token)
    ? resolvedSearchParams?.token[0]
    : resolvedSearchParams?.token;
  const bookingId = bookingIdParam ? Number(bookingIdParam) : null;
  const validBookingId =
    bookingId !== null && Number.isFinite(bookingId) ? bookingId : null;
  const token = tokenParam || "";

  const canShowBookingDetails = Boolean(
    validBookingId !== null &&
      token &&
      verifyBookingSuccessToken({
        token,
        bookingId: validBookingId,
        businessSlug,
        purpose: "success",
      }),
  );

  const booking = canShowBookingDetails
    ? await prisma.booking.findFirst({
        where: {
          id: validBookingId!,
          business: { slug: businessSlug },
        },
        select: {
          id: true,
          scheduled_at: true,
          estimated_end: true,
          payment_method: true,
          grand_total: true,
          amount_paid: true,
          business: { select: { name: true } },
          availed_services: {
            select: { service: { select: { name: true } } },
          },
        },
      })
    : null;

  const scheduledAt = booking?.scheduled_at
    ? new Date(booking.scheduled_at)
    : null;
  const estimatedEnd =
    booking?.estimated_end ??
    (scheduledAt ? new Date(scheduledAt.getTime() + 60 * 60 * 1000) : null);
  const serviceNames =
    booking?.availed_services
      ?.map((item: { service: { name: string } }) => item.service?.name)
      .filter(Boolean) ?? [];
  const businessName = booking?.business?.name || "Service Flow";
  const paymentDisplay = booking
    ? getBookingPaymentDisplay({
        grandTotal: booking.grand_total,
        amountPaid: booking.amount_paid,
      })
    : null;

  const calendarHref =
    booking && scheduledAt && estimatedEnd
      ? (() => {
          const servicesLabel =
            serviceNames.length > 0 ? serviceNames.join(", ") : "Appointment";
          const summary = `${servicesLabel} at ${businessName}`;
          const description =
            serviceNames.length > 0
              ? `Services: ${serviceNames.join(", ")}`
              : "Service appointment";

          const icsContent = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Service Flow//Booking//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            `UID:booking-${booking.id}@serviceflow`,
            `DTSTAMP:${formatIcsDate(new Date())}`,
            `DTSTART:${formatIcsDate(scheduledAt)}`,
            `DTEND:${formatIcsDate(estimatedEnd)}`,
            `SUMMARY:${escapeIcsText(summary)}`,
            `DESCRIPTION:${escapeIcsText(description)}`,
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\n");

          return `data:text/calendar;charset=utf-8,${encodeURIComponent(
            icsContent,
          )}`;
        })()
      : null;

  return (
    <div className="flex w-full max-w-xl flex-col gap-5 animate-in fade-in zoom-in-95 duration-500 sm:gap-6">
      {/* Hero — green gradient confirmation card. Mirrors the salary
          tile recipe from the employee dashboard (grain mask + soft
          white orb + soft layered shadow). */}
      <div
        className={[
          "relative isolate overflow-hidden rounded-3xl text-white",
          "bg-gradient-to-br from-primary via-emerald-700 to-emerald-900",
          "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-20px_color-mix(in_oklch,var(--primary)_60%,transparent)]",
        ].join(" ")}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-10 -z-10 size-48 rounded-full bg-white/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_70%_60%_at_30%_30%,black_30%,transparent_100%)]"
        />

        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-50/85">
              Booking confirmed
            </p>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
              <CheckCircle2 className="size-4" />
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
              You&rsquo;re all set, see you soon.
            </h1>
            <p className="mt-2 text-sm text-emerald-100/85">
              {scheduledAt ? (
                <>
                  <span className="font-medium text-white">
                    {scheduledAt.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  {" · "}
                  <span className="font-medium text-white">
                    {scheduledAt.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>{" "}
                  at {businessName}
                </>
              ) : (
                <>Your appointment has been scheduled at {businessName}.</>
              )}
            </p>
          </div>

          {/* Booking ID chip — quiet but copy-pastable for support. */}
          {booking ? (
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-emerald-50/90 ring-1 ring-inset ring-white/15">
              <Sparkles className="size-3" />
              <span className="tabular-nums">Reference #{booking.id}</span>
            </p>
          ) : null}
        </div>
      </div>

      {/* Details — neutral PortalCard with eyebrow header. */}
      <PortalCard>
        <PortalCardHeader
          eyebrow="What you booked"
          title="Booking details"
        />
        <PortalCardBody className="space-y-5">
          {booking ? (
            <>
              {estimatedEnd ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Window
                  </p>
                  <p className="text-base font-medium tracking-[-0.01em] tabular-nums text-foreground">
                    {scheduledAt?.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" – "}
                    {estimatedEnd.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Services
                </p>
                {serviceNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {serviceNames.map((name: string, index: number) => (
                      <span
                        key={index}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/15"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No services listed
                  </p>
                )}
              </div>

              {paymentDisplay ? (
                <div className="rounded-2xl border border-black/[0.06] bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {paymentDisplay.grandTotalLabel}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      PHP {paymentDisplay.grandTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {paymentDisplay.amountPaidLabel}
                    </span>
                    <span className="font-semibold tabular-nums text-primary">
                      PHP {paymentDisplay.amountPaid.toFixed(2)}
                    </span>
                  </div>
                  {paymentDisplay.remainingBalance > 0 ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {paymentDisplay.remainingBalanceLabel}
                      </span>
                      <span className="font-semibold tabular-nums text-amber-700">
                        PHP {paymentDisplay.remainingBalance.toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Could not retrieve booking details.
            </p>
          )}
        </PortalCardBody>
      </PortalCard>

      {/* Actions — primary CTA full-width, secondaries paired. */}
      <div className="flex flex-col gap-3">
        {/* "Manage" link uses a long-lived purpose:"manage" token so the
            customer can come back and cancel / reschedule from this URL
            up until the 6-hour cutoff. Issued only when the success-page
            token already verified, so we're not leaking it to randoms. */}
        {booking ? (
          <Button
            asChild
            variant="outline"
            className="h-11 w-full rounded-2xl border-black/[0.06]"
          >
            <Link
              href={`/${businessSlug}/booking/manage?bookingId=${booking.id}&token=${createBookingSuccessToken(
                {
                  bookingId: booking.id,
                  businessSlug,
                  purpose: "manage",
                  ttlSeconds: BOOKING_MANAGE_TOKEN_TTL_SECONDS,
                },
              )}`}
            >
              <Settings2 className="mr-2 size-4" />
              Manage your booking
            </Link>
          </Button>
        ) : null}

        <Button
          asChild
          className="h-12 w-full rounded-2xl text-base shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-16px_color-mix(in_oklch,var(--primary)_60%,transparent)] transition-shadow hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_32px_-16px_color-mix(in_oklch,var(--primary)_70%,transparent)]"
        >
          <Link href={`/${businessSlug}/booking`}>
            Book another service
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>

        <div className="grid grid-cols-2 gap-3">
          {calendarHref ? (
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-2xl border-black/[0.06]"
            >
              <a href={calendarHref} download="booking.ics">
                <CalendarPlus className="mr-2 size-4" />
                Add to calendar
              </a>
            </Button>
          ) : null}
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-2xl border-black/[0.06]"
          >
            <Link href="/">
              <Home className="mr-2 size-4" />
              Go home
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        A confirmation email has been sent to your inbox.
      </p>
    </div>
  );
}

export default function BookingSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<BookingSuccessSearchParams>;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-background p-4 md:p-8">
      <Suspense
        fallback={
          <div className="flex w-full max-w-xl flex-col gap-5 animate-pulse sm:gap-6">
            <div className="h-44 w-full rounded-3xl bg-muted" />
            <div className="h-72 w-full rounded-3xl bg-muted" />
          </div>
        }
      >
        <BookingSuccessContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
