import BookingDataContainer from "@/components/bookings/BookingDataContainer";
import BeautyFeelBooking from "@/components/facing/beautyfeel/BeautyFeelBooking";
import { isBeautyFeelSlug } from "@/components/facing/beautyfeel/content";
import BookingSkeleton from "@/components/skeletons/BookingSkeleton";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Book an Appointment | Service Flow",
  description:
    "Reserve your appointment online. Choose services, pick a time, and confirm your booking.",
  robots: {
    index: false,
    follow: true,
  },
};

export default async function BookingPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  // Cheap slug check up front so we can dispatch to the BeautyFeel layout
  // without re-fetching. Each branch handles its own data loading and
  // skeleton state inside its Suspense boundary.
  const { businessSlug } = await params;

  if (isBeautyFeelSlug(businessSlug)) {
    return (
      <Suspense fallback={<BookingSkeleton variant="beautyfeel" />}>
        <BeautyFeelBooking params={Promise.resolve({ businessSlug })} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <Suspense fallback={<BookingSkeleton />}>
        <BookingDataContainer params={Promise.resolve({ businessSlug })} />
      </Suspense>
    </div>
  );
}
