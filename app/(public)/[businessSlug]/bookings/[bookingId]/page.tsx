import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { CheckCircle2, XCircle, Calendar, Clock } from "lucide-react";
import { getPublicBookingDetails } from "@/features/bookings/queries/public-details";
import type { Metadata } from "next";
import { verifyBookingSuccessToken } from "@/lib/security/booking-success-token";
import { getBookingPaymentDisplay } from "@/lib/utils/booking-payment-display";

export const metadata: Metadata = {
  title: "Booking Details",
  robots: {
    index: false,
    follow: false,
  },
};

interface BookingPageProps {
  params: Promise<{
    businessSlug: string;
    bookingId: string;
  }>;
  searchParams: Promise<{
    token?: string | string[];
  }>;
}

export default async function BookingPage({
  params,
  searchParams,
}: BookingPageProps) {
  const { businessSlug, bookingId } = await params;
  const resolvedSearchParams = await searchParams;
  const id = parseInt(bookingId, 10);

  if (isNaN(id)) {
    return notFound();
  }

  const tokenParam = Array.isArray(resolvedSearchParams?.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams?.token;
  const canViewBooking = Boolean(
    tokenParam &&
      verifyBookingSuccessToken({
        token: tokenParam,
        bookingId: id,
        businessSlug,
        purpose: "details",
      }),
  );

  if (!canViewBooking) {
    return notFound();
  }

  const booking = await getPublicBookingDetails(businessSlug, id);
  if (!booking) {
    return notFound();
  }

  const paymentDisplay = getBookingPaymentDisplay({
    grandTotal: booking.grand_total,
    amountPaid: booking.amount_paid,
  });

  const statusColor =
    booking.status === "ACCEPTED"
      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
      : booking.status === "CANCELLED"
        ? "bg-red-100 text-red-800 hover:bg-red-100"
        : "bg-gray-100 text-gray-800 hover:bg-gray-100";

  const statusIcon =
    booking.status === "ACCEPTED" ? (
      <CheckCircle2 className="mr-1 h-5 w-5" />
    ) : booking.status === "CANCELLED" ? (
      <XCircle className="mr-1 h-5 w-5" />
    ) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {booking.business.name}
          </h1>
          <p className="text-gray-500">Booking Confirmation</p>
        </div>

        <Card className="border-t-4 border-t-emerald-500 shadow-lg">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="mb-1 text-sm font-medium uppercase tracking-wider text-gray-500">
                  Booking Reference
                </CardTitle>
                <p className="text-2xl font-bold text-gray-900 font-mono">
                  #{booking.id}
                </p>
              </div>
              <Badge className={`${statusColor} flex items-center border-0 px-3 py-1`}>
                {statusIcon}
                {booking.status}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center space-x-3">
                <div className="rounded-full bg-white p-2 text-emerald-600 shadow-sm">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Date
                  </p>
                  <p className="font-semibold text-gray-900">
                    {booking.scheduled_at
                      ? format(new Date(booking.scheduled_at), "MMMM d, yyyy")
                      : "TBD"}
                  </p>
                </div>
              </div>
              <div className="mx-2 h-10 w-px bg-emerald-200"></div>
              <div className="flex flex-1 items-center space-x-3 text-right">
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Time
                  </p>
                  <p className="font-semibold text-gray-900">
                    {booking.scheduled_at
                      ? format(new Date(booking.scheduled_at), "h:mm a")
                      : "TBD"}
                  </p>
                </div>
                <div className="rounded-full bg-white p-2 text-emerald-600 shadow-sm">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                Services Booked
              </h3>
              <div className="space-y-3">
                {booking.availed_services.map((availed) => (
                  <div
                    key={availed.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center">
                      <div className="mr-2.5 h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                      <span className="text-gray-700">{availed.service.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      PHP {Number(availed.price).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{paymentDisplay.grandTotalLabel}</span>
                <span>PHP {paymentDisplay.grandTotal.toFixed(2)}</span>
              </div>

              {booking.total_discount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount</span>
                  <span>-PHP {Number(booking.total_discount).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm text-gray-700">
                <span>{paymentDisplay.amountPaidLabel}</span>
                <span className="font-semibold text-emerald-700">
                  PHP {paymentDisplay.amountPaid.toFixed(2)}
                </span>
              </div>

              {paymentDisplay.remainingBalance > 0 && (
                <div className="flex justify-between text-sm text-amber-700">
                  <span>{paymentDisplay.remainingBalanceLabel}</span>
                  <span className="font-semibold">
                    PHP {paymentDisplay.remainingBalance.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col space-y-4 bg-gray-50/50 p-6">
            <div className="w-full text-center">
              <p className="mb-4 text-xs text-gray-500">
                Please arrive 10 minutes before your scheduled time.
              </p>

              {booking.payment_method === "CASH" && (
                <div className="mb-4 inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                  Payment: Cash on Arrival
                </div>
              )}
            </div>

            <Button
              asChild
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Link href={`/${businessSlug}/booking`}>Book Another Service</Link>
            </Button>

            <Button variant="ghost" className="w-full text-gray-500" asChild>
              <Link href={`/${businessSlug}`}>Back to Home</Link>
            </Button>
          </CardFooter>
        </Card>

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>
            &copy; {new Date().getFullYear()} {booking.business.name}. Powered by{" "}
            <span className="font-semibold text-emerald-600">ServiceFlow</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
