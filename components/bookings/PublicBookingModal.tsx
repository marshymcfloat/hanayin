import BookingForm from "@/components/bookings/BookingForm";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  getCachedBusinessBySlug,
  getCachedPackages,
  getCachedServices,
} from "@/lib/data/cached";
import { notFound } from "next/navigation";

export interface PublicBookingModalProps {
  params: Promise<{ businessSlug: string }>;
}

export default async function PublicBookingModal({
  params,
}: PublicBookingModalProps) {
  const { businessSlug } = await params;
  const business = await getCachedBusinessBySlug(businessSlug);

  if (!business) {
    return notFound();
  }

  const [services, packages] = await Promise.all([
    getCachedServices(business.id),
    getCachedPackages(business.id),
  ]);

  const categories = Array.from(new Set(services.map((s) => s.category)));

  return (
    <Modal
      className="h-[95dvh] w-[95vw] max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-2xl sm:border"
      modal={true}
    >
      <div className="flex h-full flex-col">
        <div className="border-b bg-background/95 px-4 py-3 pr-11 backdrop-blur-sm sm:px-6 sm:py-4 sm:pr-12">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarFallback className="font-semibold">
                {business.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Secure booking
              </p>
              <p className="truncate text-base font-semibold">
                Book with {business.name}
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto shrink-0">
              Online
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose services and a time, then place a temporary hold while you
            send the 20% GCash deposit.
          </p>
        </div>

        <div className="max-h-[calc(100dvh-85px)] overflow-y-auto overscroll-contain px-3 py-3 sm:max-h-[calc(90vh-96px)] sm:px-6 sm:py-5">
          <BookingForm
            services={services}
            packages={packages}
            categories={categories}
            isModal={true}
            mobileActionBarMode="fixed"
            gcash={{ accountName: business.gcash_account_name, mobileNumber: business.gcash_mobile_number, qrImageUrl: business.gcash_qr_image_url, instructions: business.gcash_instructions }}
          />
        </div>
      </div>
    </Modal>
  );
}
