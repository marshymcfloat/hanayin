import BookingForm from "@/components/bookings/BookingForm";
import { Modal } from "@/components/ui/modal";
import { notFound } from "next/navigation";
import { getInternalBookingFormData } from "@/features/bookings/queries/providers";

import { Suspense } from "react";

async function InterceptedBookingContent({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;

  const data = await getInternalBookingFormData(businessSlug);
  if (!data) {
    return notFound();
  }

  const { business, services, categories, isStaff, currentEmployeeId } = data;
  return (
    <Modal
      title={`Add Booking for ${business.name}`}
      description="Create a new booking directly from the dashboard."
      className="sm:max-w-4xl"
      modal={true}
    >
      <div className="p-1">
        <BookingForm
          services={services}
          categories={categories}
          isEmployee={isStaff}
          currentEmployeeId={currentEmployeeId}
          isModal={true}
        />
      </div>
    </Modal>
  );
}

export default async function InterceptedBookingPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  await params;
  return (
    <Suspense
      fallback={
        <Modal
          title="Loading..."
          description="Please wait..."
          className="sm:max-w-4xl"
          modal={true}
        >
          <div className="h-96 w-full flex items-center justify-center">
            Loading...
          </div>
        </Modal>
      }
    >
      <InterceptedBookingContent params={params} />
    </Suspense>
  );
}
