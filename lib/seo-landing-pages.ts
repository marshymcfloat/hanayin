export type SeoLandingFaq = {
  question: string;
  answer: string;
};

export type SeoLandingPage = {
  slug: string;
  title: string;
  headline: string;
  description: string;
  location: string;
  industry: string;
  focusKeywords: string[];
  painPoints: string[];
  capabilities: string[];
  idealFor: string[];
  faqs: SeoLandingFaq[];
};

export const seoLandingPages: SeoLandingPage[] = [
  {
    slug: "salon-software-manila",
    title: "Salon Software Manila | Appointment, POS, and Staff Management",
    headline: "Salon management software for Manila teams",
    description:
      "ServiceFlow helps Manila salons manage bookings, POS, payroll, and staff schedules in one platform built for Philippine operations.",
    location: "Manila",
    industry: "Salon",
    focusKeywords: [
      "salon software manila",
      "salon management software manila",
      "appointment system manila salon",
      "salon pos manila",
      "hair salon booking software philippines",
      "salon payroll software manila",
      "manila salon crm",
      "beauty salon software manila",
    ],
    painPoints: [
      "Manual appointment lists that cause double-bookings during peak hours.",
      "Front desk bottlenecks when walk-ins, online bookings, and calls overlap.",
      "Late payroll calculations for stylists with commission-based payouts.",
      "No single dashboard to track rebooking and no-show trends.",
    ],
    capabilities: [
      "Centralized booking calendar for online, walk-in, and staff-assisted bookings.",
      "Service-level pricing and POS-ready checkout for faster front desk flow.",
      "Commission and payroll support tied to completed services.",
      "Customer history and reminder workflows to improve repeat visits.",
    ],
    idealFor: [
      "Single-branch salons in Manila CBDs and malls.",
      "Growing salon chains standardizing branch operations.",
      "Teams needing better reporting for owner and manager decisions.",
    ],
    faqs: [
      {
        question: "Is ServiceFlow suitable for a small salon in Manila?",
        answer:
          "Yes. It works for small and growing salons that need reliable booking and staff workflow management.",
      },
      {
        question: "Can I manage payroll and commission in one place?",
        answer:
          "Yes. ServiceFlow supports staff tracking and commission-aware operations for service businesses.",
      },
    ],
  },
  {
    slug: "spa-booking-software-cebu",
    title: "Spa Booking Software Cebu | Manage Appointments and Staff",
    headline: "Spa booking software for Cebu wellness businesses",
    description:
      "Run a faster spa operation in Cebu with ServiceFlow. Manage appointments, reminders, staff schedules, and business performance from one dashboard.",
    location: "Cebu",
    industry: "Spa",
    focusKeywords: [
      "spa booking software cebu",
      "spa management software cebu",
      "cebu spa appointment system",
      "wellness booking platform philippines",
      "massage spa software cebu",
      "spa scheduling software philippines",
      "spa reminders software",
      "spa pos system cebu",
    ],
    painPoints: [
      "High no-show rates that create empty therapist slots.",
      "Fragmented records for package sessions and repeat clients.",
      "Manual reminders that consume staff time every day.",
      "Limited visibility into which treatments drive revenue.",
    ],
    capabilities: [
      "Online appointment workflows with structured booking steps.",
      "Automated reminders to reduce missed appointments.",
      "Service and staff scheduling in one operational view.",
      "Simple reporting for top treatments, utilization, and demand periods.",
    ],
    idealFor: [
      "Day spas and wellness centers in Cebu City.",
      "Massage clinics handling recurring treatment sessions.",
      "Spa teams focused on retention and customer experience quality.",
    ],
    faqs: [
      {
        question: "Can ServiceFlow help reduce spa no-shows?",
        answer:
          "Yes. Automated reminder workflows and clearer booking confirmations help reduce missed appointments.",
      },
      {
        question: "Does it work for multiple spa therapists?",
        answer:
          "Yes. You can manage therapist schedules and appointment allocations from one platform.",
      },
    ],
  },
  {
    slug: "barbershop-software-davao",
    title: "Barbershop Software Davao | Booking and Operations Platform",
    headline: "Barbershop software built for Davao operators",
    description:
      "ServiceFlow helps Davao barbershops handle bookings, queues, staff schedules, and repeat customer tracking without spreadsheet-heavy workflows.",
    location: "Davao",
    industry: "Barbershop",
    focusKeywords: [
      "barbershop software davao",
      "barber booking app davao",
      "barbershop management software philippines",
      "davao barber appointment system",
      "barbershop pos philippines",
      "queue management barbershop",
      "barber shop scheduling software",
      "barbershop crm davao",
    ],
    painPoints: [
      "Unclear queue order when walk-ins and online bookings mix.",
      "Inconsistent haircut duration estimates affecting daily capacity.",
      "Limited customer history for preferred cuts and barbers.",
      "Manual reporting for daily sales and barber performance.",
    ],
    capabilities: [
      "Structured appointment and queue-ready scheduling flow.",
      "Service catalog with duration and pricing clarity.",
      "Customer records that preserve visit and service history.",
      "Daily operations reporting for owners and supervisors.",
    ],
    idealFor: [
      "Independent barbershops in Davao City.",
      "Men's grooming businesses scaling to more chairs or branches.",
      "Teams shifting from paper logs to digital scheduling.",
    ],
    faqs: [
      {
        question: "Can we handle both appointments and walk-ins?",
        answer:
          "Yes. ServiceFlow supports organized booking workflows while helping teams manage real-time front desk demand.",
      },
      {
        question: "Is it useful for barber performance tracking?",
        answer:
          "Yes. Reporting and service-level records help monitor productivity and sales trends.",
      },
    ],
  },
  {
    slug: "beauty-clinic-software-quezon-city",
    title: "Beauty Clinic Software Quezon City | Scheduling and Client Records",
    headline: "Beauty clinic software for Quezon City operations",
    description:
      "ServiceFlow gives Quezon City beauty clinics a reliable platform for appointment scheduling, treatment records, follow-ups, and daily business oversight.",
    location: "Quezon City",
    industry: "Beauty Clinic",
    focusKeywords: [
      "beauty clinic software quezon city",
      "aesthetic clinic appointment system",
      "skin clinic scheduling software philippines",
      "quezon city clinic booking system",
      "beauty clinic crm philippines",
      "aesthetic center operations software",
      "treatment booking software qc",
      "clinic follow-up reminder software",
    ],
    painPoints: [
      "Disorganized treatment follow-up schedules across returning clients.",
      "Incomplete client records that slow consultations and repeat visits.",
      "No consolidated view for branch-level bookings and staff schedules.",
      "Manual back-office tracking for daily clinic performance.",
    ],
    capabilities: [
      "Appointment and follow-up scheduling in a unified workflow.",
      "Client history support for better continuity of care and service.",
      "Staff and treatment planning from one operations hub.",
      "Performance reporting for demand, utilization, and revenue visibility.",
    ],
    idealFor: [
      "Aesthetic clinics with high repeat treatment volume.",
      "Skin and beauty centers modernizing front desk and booking workflows.",
      "Clinic teams that need better scheduling consistency.",
    ],
    faqs: [
      {
        question: "Can ServiceFlow support follow-up treatments?",
        answer:
          "Yes. Teams can manage repeat appointments and monitor treatment-related booking activity.",
      },
      {
        question: "Does it work for beauty clinics with multiple staff roles?",
        answer:
          "Yes. It is designed for service teams handling consultations, procedures, and front desk coordination.",
      },
    ],
  },
  {
    slug: "nail-salon-software-makati",
    title: "Nail Salon Software Makati | Booking, Staff, and Customer Growth",
    headline: "Nail salon software for Makati customer demand",
    description:
      "ServiceFlow helps Makati nail salons streamline appointments, improve staff utilization, and increase repeat bookings through better customer workflows.",
    location: "Makati",
    industry: "Nail Salon",
    focusKeywords: [
      "nail salon software makati",
      "nail salon booking app philippines",
      "makati nail salon management software",
      "nail spa appointment system",
      "nail salon pos philippines",
      "nail salon staff scheduling software",
      "pedicure manicure booking software",
      "nail salon crm makati",
    ],
    painPoints: [
      "Peak-hour overlap for nail technicians and service stations.",
      "Manual tracking of add-ons and combo service pricing.",
      "Weak retention due to missed reminder and rebooking opportunities.",
      "Fragmented branch performance data for owners and managers.",
    ],
    capabilities: [
      "Time-slot scheduling tailored for technician availability.",
      "Service and add-on management for clear checkout flow.",
      "Reminder workflows that encourage return appointments.",
      "Operational metrics to monitor demand and team utilization.",
    ],
    idealFor: [
      "Nail salons in business districts and lifestyle malls.",
      "Teams offering bundles and add-on beauty services.",
      "Operators aiming to improve technician productivity.",
    ],
    faqs: [
      {
        question: "Can ServiceFlow handle nail service add-ons?",
        answer:
          "Yes. Teams can structure service listings and pricing to reflect add-ons and combinations clearly.",
      },
      {
        question: "Is this useful for high-traffic Makati locations?",
        answer:
          "Yes. The booking and operations workflow is designed to support busy service hours and staff coordination.",
      },
    ],
  },
  {
    slug: "multi-branch-salon-software-philippines",
    title: "Multi-Branch Salon Software Philippines | Centralized Operations",
    headline: "Multi-branch salon software for Philippine growth teams",
    description:
      "ServiceFlow gives multi-branch salon brands in the Philippines a single system for bookings, staffing, reporting, and branch-level performance visibility.",
    location: "Philippines",
    industry: "Multi-Branch Salon",
    focusKeywords: [
      "multi-branch salon software philippines",
      "salon chain management software",
      "branch scheduling software salon",
      "centralized salon reporting platform",
      "philippines salon operations software",
      "salon franchise software",
      "multi-location salon booking system",
      "salon performance dashboard philippines",
    ],
    painPoints: [
      "Branch teams operating on different booking and reporting methods.",
      "No centralized dashboard for utilization and staffing comparisons.",
      "Inconsistent customer data and retention workflows across locations.",
      "Slow decision-making due to delayed branch performance reports.",
    ],
    capabilities: [
      "Unified scheduling workflows for all participating branches.",
      "Centralized visibility into bookings, staff activity, and demand.",
      "Consistent service data and customer records across locations.",
      "Operational reporting that supports scalable expansion decisions.",
    ],
    idealFor: [
      "Salon groups with two or more active branches.",
      "Franchise operators standardizing service operations.",
      "Regional teams needing consolidated visibility and control.",
    ],
    faqs: [
      {
        question: "Can ServiceFlow support branch-level visibility?",
        answer:
          "Yes. ServiceFlow is designed to give managers and owners clearer oversight across locations.",
      },
      {
        question: "Is this suitable before opening additional branches?",
        answer:
          "Yes. Many teams use centralized systems early to avoid fragmented workflows as they scale.",
      },
    ],
  },
];

export function getSeoLandingPageBySlug(slug: string) {
  return seoLandingPages.find((page) => page.slug === slug);
}
