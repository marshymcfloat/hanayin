import { notFound } from "next/navigation";
import {
  getCachedBusinessBySlug,
  getCachedServices,
  getCachedPackages,
} from "@/lib/data/cached";
import BookingForm from "@/components/bookings/BookingForm";
import { PortalShell } from "@/components/portal/PortalShell";
import { PublicBookingGreeting } from "@/components/bookings/public-booking/PublicBookingGreeting";
import { summarizeBusinessHours } from "@/components/bookings/public-booking/hours-summary";

export default async function BookingDataContainer({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const business = await getCachedBusinessBySlug(businessSlug);

  if (!business) {
    return notFound();
  }

  const services = await getCachedServices(business.id);
  const packages = await getCachedPackages(business.id);
  const categories = Array.from(new Set(services.map((s) => s.category)));

  const hoursSummary = summarizeBusinessHours(business.business_hours ?? []);

  return (
    <PortalShell
      greeting={
        <PublicBookingGreeting
          businessName={business.name}
          businessInitials={business.initials}
          imageUrl={business.imageUrl ?? undefined}
          hoursSummary={hoursSummary}
        />
      }
    >
      <main className="md:col-span-2 xl:col-span-12">
        <BookingForm
          services={services}
          packages={packages}
          categories={categories}
          gcash={{
            accountName: business.gcash_account_name,
            mobileNumber: business.gcash_mobile_number,
            qrImageUrl: business.gcash_qr_image_url,
            instructions: business.gcash_instructions,
          }}
        />
      </main>
    </PortalShell>
  );
}
