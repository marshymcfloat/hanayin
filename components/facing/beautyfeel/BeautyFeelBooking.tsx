import { notFound } from "next/navigation";
import {
  getCachedBusinessBySlug,
  getCachedServices,
  getCachedPackages,
} from "@/lib/data/cached";
import BookingForm from "@/components/bookings/BookingForm";
import BeautyFeelShell from "./BeautyFeelShell";

export interface BeautyFeelBookingProps {
  params: Promise<{ businessSlug: string }>;
}

export default async function BeautyFeelBooking({
  params,
}: BeautyFeelBookingProps) {
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

  const navItems = [
    { label: "Home", href: `/${businessSlug}` },
    { label: "Services", href: `/${businessSlug}/services` },
    { label: "Visit", href: `/${businessSlug}#visit` },
  ];

  return (
    <BeautyFeelShell
      businessName={business.name}
      businessSlug={businessSlug}
      navItems={navItems}
      headerVariant="solid"
    >
      {/* ────────────────────── HERO STRIP ────────────────────── */}
      {/* Short typography-only header. Pulled up under the sticky header
          via negative top margin. */}
      <section className="relative -mt-16 sm:-mt-20">
        <div className="bg-[color:var(--bf-blush)]/30 pt-28 pb-10 sm:pt-36 sm:pb-12 lg:pt-40 lg:pb-14">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
              Reserve · {business.name}
            </p>
            <h1 className="mt-4 text-balance font-[var(--font-serif)] text-4xl font-normal leading-[1.05] tracking-[-0.01em] text-[color:var(--bf-ink)] sm:text-5xl lg:text-6xl">
              Book a treatment.{" "}
              <em className="font-[var(--font-serif)] italic text-[color:var(--bf-muted)]">
                Take a breath.
              </em>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[color:var(--bf-muted)] sm:text-lg">
              Pick what you need, choose a time, and drop your number.
              We&apos;ll confirm by message.
            </p>
          </div>
        </div>
      </section>

      {/* ────────────────────── FORM ────────────────────── */}
      {/* CSS-variable scope override: BookingForm uses portal tokens
          (--primary / --primary-foreground) globally. Without this
          override the new step-header chips and selected slot buttons
          render in the global green, which clashes with BeautyFeel's
          ink-on-cream palette. Mapping the tokens to BF brand colors
          inside this wrapper re-themes the entire form to BF without
          forking the form component. */}
      <section
        className="mx-auto max-w-5xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14 sm:pb-10 lg:pt-20 lg:pb-14 [--primary:var(--bf-ink)] [--primary-foreground:var(--bf-cream)] [--ring:var(--bf-ink)]"
      >
        <div className="rounded-2xl border border-black/[0.08] bg-[color:var(--bf-cream)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.06)]">
          <div className="p-4 sm:p-7">
            <BookingForm
              services={services}
              packages={packages}
              categories={categories}
              gcash={{ accountName: business.gcash_account_name, mobileNumber: business.gcash_mobile_number, qrImageUrl: business.gcash_qr_image_url, instructions: business.gcash_instructions }}
            />
          </div>
        </div>
      </section>
    </BeautyFeelShell>
  );
}
