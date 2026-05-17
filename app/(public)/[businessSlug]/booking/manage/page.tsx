import { Metadata } from "next";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { getBookingForManageAction } from "@/lib/server actions/booking-self-serve";
import { ManageBookingClient } from "@/components/bookings/manage/ManageBookingClient";

type ManageSearchParams = {
  bookingId?: string | string[];
  token?: string | string[];
};

export const metadata: Metadata = {
  title: "Manage Your Booking | Service Flow",
  description:
    "Cancel or reschedule your appointment online.",
  robots: {
    index: false,
    follow: false,
  },
};

async function ManageBookingContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<ManageSearchParams>;
}) {
  const { businessSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const bookingIdParam = Array.isArray(resolvedSearchParams?.bookingId)
    ? resolvedSearchParams.bookingId[0]
    : resolvedSearchParams?.bookingId;
  const tokenParam = Array.isArray(resolvedSearchParams?.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams?.token;

  const bookingId = bookingIdParam ? Number(bookingIdParam) : NaN;
  const token = tokenParam ?? "";
  if (!Number.isFinite(bookingId) || !token) {
    return <InvalidLink />;
  }

  const result = await getBookingForManageAction({
    bookingId,
    businessSlug,
    token,
  });
  if (!result.success) {
    return <InvalidLink message={result.error} />;
  }

  return <ManageBookingClient booking={result.booking} />;
}

function InvalidLink({ message }: { message?: string }) {
  return (
    <div className="flex w-full max-w-md flex-col items-center text-center gap-3 rounded-3xl border border-black/[0.06] bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <span className="grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
        <ShieldAlert className="size-5" />
      </span>
      <h1 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
        This link is invalid or has expired
      </h1>
      <p className="text-sm text-muted-foreground">
        {message ??
          "Manage links are tied to a specific booking and expire after a period of time. Please use the most recent link from your confirmation, or contact the business directly."}
      </p>
    </div>
  );
}

export default function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<ManageSearchParams>;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-background p-4 md:p-8">
      <Suspense
        fallback={
          <div className="w-full max-w-xl space-y-5 animate-pulse">
            <div className="h-44 w-full rounded-3xl bg-muted" />
            <div className="h-72 w-full rounded-3xl bg-muted" />
          </div>
        }
      >
        <ManageBookingContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
