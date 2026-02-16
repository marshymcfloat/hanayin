import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CalendarPlus, Home, ArrowRight } from "lucide-react";
import { Metadata } from "next";
import { Suspense } from "react";
import { prisma } from "@/prisma/prisma";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { verifyBookingSuccessToken } from "@/lib/security/booking-success-token";
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

  const booking =
    canShowBookingDetails
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
    <div className="flex w-full max-w-md flex-col items-center gap-8 animate-in fade-in zoom-in-95 duration-500">
      <Card className="w-full overflow-hidden border-green-100 shadow-xl shadow-green-900/5">
        <div className="flex flex-col items-center justify-center border-b border-green-100 bg-green-50/50 p-8">
          <div className="relative mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-sm ring-8 ring-green-50">
            <CheckCircle2 className="h-12 w-12 animate-in zoom-in text-green-600 duration-300 delay-150" />
            <div className="absolute inset-0 animate-ping rounded-full bg-green-400/20 duration-1000" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-green-950">
            Booking Confirmed!
          </h1>
          <p className="mt-2 text-center text-sm font-medium text-green-800/80">
            Your appointment has been successfully scheduled.
          </p>
        </div>

        <CardContent className="space-y-6 pt-6">
          {booking ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between text-sm">
                <span className="text-muted-foreground">Business via</span>
                <span className="text-right font-semibold">{businessName}</span>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Date & Time
                </p>
                <p className="text-lg font-medium">
                  {scheduledAt?.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {scheduledAt?.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {" - "}
                  {estimatedEnd?.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Services
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {serviceNames.map((name: string, index: number) => (
                    <Badge key={index} variant="secondary" className="font-normal">
                      {name}
                    </Badge>
                  ))}
                  {serviceNames.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No services listed
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-muted-foreground">
                    {paymentDisplay?.grandTotalLabel}
                  </span>
                  <span className="font-semibold text-foreground">
                    PHP {paymentDisplay?.grandTotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-muted-foreground">
                    {paymentDisplay?.amountPaidLabel}
                  </span>
                  <span className="font-semibold text-primary">
                    PHP {paymentDisplay?.amountPaid.toFixed(2)}
                  </span>
                </div>
                {(paymentDisplay?.remainingBalance ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-muted-foreground">
                      {paymentDisplay?.remainingBalanceLabel}
                    </span>
                    <span className="font-semibold text-amber-700">
                      PHP {paymentDisplay?.remainingBalance.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <p>Could not retrieve booking details.</p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3 px-6 pb-6 pt-2">
          <Button
            asChild
            className="h-11 w-full text-base shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98]"
          >
            <Link href={`/${businessSlug}/booking`}>
              Book Another Service <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <div className="grid w-full grid-cols-2 gap-3">
            {calendarHref && (
              <Button asChild variant="outline" className="w-full">
                <a href={calendarHref} download="booking.ics">
                  <CalendarPlus className="mr-2 h-4 w-4" /> Add to Calendar
                </a>
              </Button>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" /> Go Home
              </Link>
            </Button>
          </div>
        </CardFooter>
      </Card>

      <p className="max-w-xs text-center text-xs text-muted-foreground">
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
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-gray-50/50 p-4 md:p-8 dark:bg-zinc-950">
      <Suspense
        fallback={
          <div className="flex animate-pulse flex-col items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted"></div>
            <div className="h-8 w-48 rounded bg-muted"></div>
          </div>
        }
      >
        <BookingSuccessContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
