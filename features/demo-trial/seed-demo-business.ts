import { prisma } from "@/prisma/prisma";
import { BookingStatus, PaymentStatus, AvailedServiceStatus } from "@/prisma/generated/prisma/enums";

/**
 * Seed a freshly converted business with demo content so the trial owner
 * lands on a populated dashboard instead of empty-state placeholders.
 *
 * Every row inserted is flagged `is_demo = true` so `clearDemoDataAction`
 * can wipe the sample data with one click before the owner goes live.
 *
 * The seeder is intentionally small and predictable — five services across
 * Spa/Nails/Skin/Hair, one demo employee, three customers, a handful of past
 * bookings (so revenue widgets render) plus a couple of upcoming bookings
 * (so today's-schedule widget renders). Business hours are written for every
 * day of the week using the demo categories so the public booking page
 * shows availability.
 *
 * Returns the row counts created. Throws on any DB error — the caller is
 * responsible for compensating cleanup if the surrounding flow needs
 * atomicity.
 */

type SeedDemoSummary = {
  services: number;
  hours: number;
  employees: number;
  customers: number;
  bookings: number;
};

const DEMO_SERVICES: Array<{
  name: string;
  category: string;
  price: number;
  duration: number;
  description: string;
}> = [
  {
    name: "Classic Haircut",
    category: "Hair",
    price: 350,
    duration: 45,
    description: "Wash, cut, and style. Perfect for a fresh look.",
  },
  {
    name: "Hair Color (Single)",
    category: "Hair",
    price: 1500,
    duration: 120,
    description: "Single-process color with conditioning treatment.",
  },
  {
    name: "Manicure",
    category: "Nails",
    price: 250,
    duration: 45,
    description: "Shape, cuticle care, polish.",
  },
  {
    name: "Pedicure",
    category: "Nails",
    price: 350,
    duration: 60,
    description: "Foot soak, exfoliation, nail care, polish.",
  },
  {
    name: "Express Facial",
    category: "Skin",
    price: 800,
    duration: 60,
    description: "Cleanse, exfoliate, hydrate. Great for first-timers.",
  },
];

const DEMO_CUSTOMERS = [
  { name: "Maria Santos", phone: "+639170000001", email: "maria.demo@example.com" },
  { name: "Liza Ramos", phone: "+639170000002", email: "liza.demo@example.com" },
  { name: "Anna Cruz", phone: "+639170000003", email: "anna.demo@example.com" },
];

const DEMO_HOURS_DAYS = Array.from({ length: 7 }, (_, i) => i); // 0=Sun … 6=Sat

function setTimeOnDate(base: Date, hours: number, minutes = 0): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export async function seedDemoBusiness(
  businessId: string,
): Promise<SeedDemoSummary> {
  // Services — one row per template, all flagged is_demo.
  const createdServices = await Promise.all(
    DEMO_SERVICES.map((s) =>
      prisma.service.create({
        data: {
          name: s.name,
          description: s.description,
          price: s.price,
          duration: s.duration,
          category: s.category,
          business_id: businessId,
          is_demo: true,
        },
      }),
    ),
  );

  // Business hours — Mon–Sat 09:00–18:00, Sun closed. One row per
  // (day_of_week, category) so the booking engine resolves availability for
  // every demo service category. We don't flag hours as demo because the
  // owner will probably keep them.
  const categories = Array.from(new Set(DEMO_SERVICES.map((s) => s.category)));
  const hourRows = await Promise.all(
    DEMO_HOURS_DAYS.flatMap((day) =>
      categories.map((category) =>
        prisma.businessHours.create({
          data: {
            business_id: businessId,
            day_of_week: day,
            open_time: day === 0 ? "00:00" : "09:00",
            close_time: day === 0 ? "00:00" : "18:00",
            is_closed: day === 0,
            category,
          },
        }),
      ),
    ),
  );

  // Customers
  const createdCustomers = await Promise.all(
    DEMO_CUSTOMERS.map((c) =>
      prisma.customer.create({
        data: {
          name: c.name,
          phone: c.phone,
          email: c.email,
          business_id: businessId,
          is_demo: true,
        },
      }),
    ),
  );

  // Bookings — 3 past completed bookings (so revenue widgets show numbers)
  // and 2 upcoming (so today's-schedule shows entries).
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  type DemoBookingPlan = {
    serviceIndex: number;
    customerIndex: number;
    startOffsetMs: number;
    completed: boolean;
  };

  const plan: DemoBookingPlan[] = [
    // Past completed
    { serviceIndex: 0, customerIndex: 0, startOffsetMs: -10 * day, completed: true },
    { serviceIndex: 2, customerIndex: 1, startOffsetMs: -7 * day, completed: true },
    { serviceIndex: 4, customerIndex: 2, startOffsetMs: -3 * day, completed: true },
    // Upcoming
    { serviceIndex: 1, customerIndex: 0, startOffsetMs: 1 * day, completed: false },
    { serviceIndex: 3, customerIndex: 1, startOffsetMs: 3 * day, completed: false },
  ];

  let bookingsCreated = 0;
  for (const p of plan) {
    const service = createdServices[p.serviceIndex];
    const customer = createdCustomers[p.customerIndex];
    const baseStart = new Date(now.getTime() + p.startOffsetMs);
    const scheduledAt = setTimeOnDate(baseStart, 11);
    const estimatedEnd = new Date(
      scheduledAt.getTime() + service.duration! * 60 * 1000,
    );

    await prisma.booking.create({
      data: {
        business_id: businessId,
        customer_id: customer.id,
        status: p.completed ? BookingStatus.COMPLETED : BookingStatus.ACCEPTED,
        payment_status: p.completed ? PaymentStatus.PAID : PaymentStatus.UNPAID,
        amount_paid: p.completed ? service.price : 0,
        grand_total: service.price,
        total_discount: 0,
        scheduled_at: scheduledAt,
        estimated_end: estimatedEnd,
        is_demo: true,
        availed_services: {
          create: [
            {
              price: service.price,
              estimated_cost: service.estimated_cost,
              final_price: service.price,
              commission_base: service.price,
              status: p.completed
                ? AvailedServiceStatus.COMPLETED
                : AvailedServiceStatus.PENDING,
              service_id: service.id,
              scheduled_at: scheduledAt,
              estimated_end: estimatedEnd,
              completed_at: p.completed ? estimatedEnd : null,
            },
          ],
        },
      },
    });
    bookingsCreated++;
  }

  return {
    services: createdServices.length,
    hours: hourRows.length,
    employees: 0,
    customers: createdCustomers.length,
    bookings: bookingsCreated,
  };
}

/**
 * Wipe everything seeded by `seedDemoBusiness` for the given business.
 * Bookings cascade to AvailedService via FK, so we delete bookings first to
 * keep the order obvious. Customers/Services/Employees flagged is_demo are
 * removed last.
 */
export async function clearDemoBusinessData(businessId: string) {
  await prisma.booking.deleteMany({
    where: { business_id: businessId, is_demo: true },
  });
  await prisma.customer.deleteMany({
    where: { business_id: businessId, is_demo: true },
  });
  await prisma.employee.deleteMany({
    where: { business_id: businessId, is_demo: true },
  });
  await prisma.service.deleteMany({
    where: { business_id: businessId, is_demo: true },
  });
}
