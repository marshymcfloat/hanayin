import { hash } from "bcryptjs";
import {
  AttendanceStatus,
  AvailedServiceStatus,
  BookingPaymentStatus,
  BookingPaymentType,
  BookingStatus,
  DiscountType,
  ExpenseCategory,
  FlowDelayUnit,
  FlowType,
  PaymentMethod,
  PaymentStatus,
  Role,
  ServiceProviderType,
  SocialConnectionStatus,
  SocialPlatform,
  SocialPostSource,
  SocialPostStatus,
  VoucherType,
} from "./generated/prisma/enums";
import { prisma } from "./prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromToday(days: number, hour = 10, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function main() {
  console.log("Start seeding ...");

  await prisma.availedService.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.businessSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();

  const ownerPassword = await hash("Ellainepe123", 12);
  const employeePassword = await hash("employee123", 12);

  console.log(" Creating BeautyFeel...");

  const ownerUser = await prisma.user.create({
    data: {
      contact_number: "639170000001",
      name: "Ellaine Pe",
      hashed_password: ownerPassword,
      role: Role.OWNER,
    },
  });

  const beautyFeel = await prisma.business.create({
    data: {
      name: "BeautyFeel",
      slug: "beautyfeel",
      initials: "BF",
      description:
        "Experience premium beauty and wellness services in a relaxing environment. From rejuvenating facials to expert nail care and soothing massages, BeautyFeel is your sanctuary for self-care.",
      owners: {
        create: {
          user_id: ownerUser.id,
          specialties: ["Skin"],
          is_primary: true,
        },
      },
      latitude: 9.682940016270514,
      longitude: 118.75246245092016,
    },
  });

  const proPlan = await prisma.subscriptionPlan.create({
    data: {
      code: "PRO_MONTHLY",
      name: "Pro Monthly",
      billing_interval: "MONTHLY",
      price_amount: 400_000,
      currency: "PHP",
      is_active: true,
    },
  });

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.businessSubscription.create({
    data: {
      business_id: beautyFeel.id,
      plan_id: proPlan.id,
      status: "ACTIVE",
      current_period_start: now,
      current_period_end: periodEnd,
    },
  });

  for (const d of Array.from({ length: 7 }, (_, i) => i)) {
    for (const category of ["Spa", "Nails", "Skin", "Eyelash", "GENERAL"]) {
      await prisma.businessHours.create({
        data: {
          business_id: beautyFeel.id,
          day_of_week: d,
          open_time: "10:00",
          close_time: "22:00",
          is_closed: false,
          category,
        },
      });
    }
  }

  const bfServices = [
    // --- Nails ---
    { name: "Manicure gel", price: 280, duration: 60, category: "Nails", description: "Long-lasting gel polish application for hands." },
    { name: "Pedicure gel", price: 300, duration: 60, category: "Nails", description: "Long-lasting gel polish application for feet." },
    { name: "Foot spa", price: 250, duration: 45, category: "Nails", description: "Relaxing foot soak and scrub." },
    { name: "Foot spa with regular gel", price: 430, duration: 75, category: "Nails", description: "Complete foot spa treatment with gel polish." },
    { name: "Soft gel nail extensions", price: 699, duration: 120, category: "Nails", description: "Natural-looking soft gel extensions." },
    { name: "Regular manicure", price: 150, duration: 45, category: "Nails", description: "Classic nail cleaning and polish." },

    // --- Eyelash ---
    { name: "Classic eyelash extensions", price: 399, duration: 90, category: "Eyelash", description: "Natural looking individual lash extensions." },
    { name: "Wispy", price: 450, duration: 90, category: "Eyelash", description: "Textured, fluttery lash look." },
    { name: "Doll eye", price: 450, duration: 90, category: "Eyelash", description: "Open-eye effect with longer lashes in the middle." },
    { name: "Cat eye", price: 450, duration: 90, category: "Eyelash", description: "Elongated look with longer lashes at the corners." },
    { name: "Volume", price: 500, duration: 120, category: "Eyelash", description: "Fuller, denser lash extensions." },
    { name: "Eyelash Perming", price: 399, duration: 60, category: "Eyelash", description: "Semi-permanent lash curling." },
    { name: "Eyelash Perm with tint", price: 450, duration: 75, category: "Eyelash", description: "Lash lift combined with darkening tint." },
    { name: "Eyebrow lamination", price: 450, duration: 60, category: "Eyelash", description: "Brow smoothing and shaping treatment." },

    // --- Spa: waxing / body ---
    { name: "Underarm wax", price: 350, duration: 30, category: "Spa", description: "Smooth underarm hair removal." },
    { name: "Whole Arm", price: 350, duration: 45, category: "Spa", description: "Full arm hair removal." },
    { name: "Half legs", price: 350, duration: 45, category: "Spa", description: "Lower leg hair removal." },
    { name: "Whole legs", price: 450, duration: 60, category: "Spa", description: "Full leg hair removal." },
    { name: "Brazilian", price: 800, duration: 60, category: "Spa", description: "Complete intimate waxing." },
    { name: "Whole body scrub", price: 750, duration: 60, category: "Spa", description: "Exfoliating full body treatment." },

    // --- Skin ---
    { name: "Deep cleaning facial", price: 800, duration: 60, category: "Skin", description: "Thorough cleansing and extraction." },
    { name: "Lightening facial", price: 1200, duration: 60, category: "Skin", description: "Brightening treatment for uneven skin tone." },
    { name: "Hydraderma facial", price: 1500, duration: 75, category: "Skin", description: "Intense hydration treatment." },
    { name: "Wart treatment (minimum)", price: 800, duration: 30, category: "Skin", description: "Removal of skin warts." },
    { name: "Acne facial", price: 999, duration: 75, category: "Skin", description: "Targeted treatment for acne-prone skin." },
    { name: "BB glow with cheek blush", price: 2300, duration: 90, category: "Skin", description: "Semi-permanent foundation effect." },
    { name: "Carbon laser deluxe", price: 1900, duration: 60, category: "Skin", description: "Laser treatment for pore reduction and glow." },
    { name: "CO2 fractional laser", price: 5000, duration: 60, category: "Skin", description: "Advanced skin resurfacing." },
    { name: "Microneedling", price: 3500, duration: 90, category: "Skin", description: "Collagen induction therapy." },
    { name: "IPL (Hair growth treatment)", price: 500, duration: 45, category: "Skin", description: "Intense Pulsed Light for hair reduction." },
    { name: "Exilift (price starts at)", price: 899, duration: 60, category: "Skin", description: "Non-surgical skin tightening." },
    { name: "Glutathione drip and push(price starts at)", price: 800, duration: 45, category: "Skin", description: "IV therapy for skin brightening." },

    // --- Spa: massage ---
    { name: "60mins Swedish massage", price: 500, duration: 60, category: "Spa", description: "Relaxing full body massage." },
    { name: "60mins Combination massage", price: 600, duration: 60, category: "Spa", description: "Mix of Swedish and Shiatsu techniques." },
    { name: "60mins Thai massage", price: 700, duration: 60, category: "Spa", description: "Stretching and deep pressure massage." },
    { name: "60mins Siatsu massage", price: 700, duration: 60, category: "Spa", description: "Japanese pressure point massage." },
    { name: "90 mins Traditional massage", price: 800, duration: 90, category: "Spa", description: "Healing traditional hilot massage." },
    { name: "90 mins Hot stone massage", price: 999, duration: 90, category: "Spa", description: "Massage with heated basalt stones." },
    { name: "90mins Ventossa massage", price: 999, duration: 90, category: "Spa", description: "Cupping therapy massage." },
    { name: "Prenatal massage(DOH lic. Therapist only)", price: 500, duration: 60, category: "Spa", description: "Safe and soothing massage for expectant mothers." },
    { name: "Pediatric massage", price: 500, duration: 60, category: "Spa", description: "Gentle massage for children." },
    { name: "30mins back massage", price: 300, duration: 30, category: "Spa", description: "Focused relief for back tension." },
    { name: "45mins back and head massage", price: 400, duration: 45, category: "Spa", description: "Relief for upper body stress." },
    { name: "30mins Foot reflex and leg massage", price: 300, duration: 30, category: "Spa", description: "Pressure point foot therapy." },
    { name: "45mins Foot reflex and leg massage", price: 400, duration: 45, category: "Spa", description: "Extended foot and leg therapy." },
  ];

  const servicesByName = new Map<string, Awaited<ReturnType<typeof prisma.service.create>>>();
  for (const s of bfServices) {
    const service = await prisma.service.create({
      data: { ...s, business_id: beautyFeel.id },
    });
    servicesByName.set(service.name, service);
  }

  const bfEmployees = [
    {
      name: "Jan David Almirante",
      contact_number: "639170000010",
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
    },
    {
      name: "Daniel Canoy",
      contact_number: "639170000011",
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
    },
    {
      name: "Mikaela Reyes",
      contact_number: "639170000012",
      specialties: ["Skin", "Eyelash"],
    },
    {
      name: "Aira Dizon",
      contact_number: "639170000013",
      specialties: ["Nails", "Spa"],
    },
    {
      name: "Bea Mercado",
      contact_number: "639170000014",
      specialties: ["Skin", "Spa"],
    },
  ];

  const employees = [];
  for (const emp of bfEmployees) {
    const u = await prisma.user.create({
      data: {
        contact_number: emp.contact_number,
        name: emp.name,
        hashed_password: employeePassword,
        role: Role.EMPLOYEE,
      },
    });
    const createdEmployee = await prisma.employee.create({
      data: {
        user_id: u.id,
        business_id: beautyFeel.id,
        salary: 0,
        daily_rate: 600,
        commission_percentage: 10,
        specialties: emp.specialties,
      },
    });
    employees.push(createdEmployee);
  }

  const requiredService = (name: string) => {
    const service = servicesByName.get(name);
    if (!service) throw new Error(`Missing seeded service: ${name}`);
    return service;
  };

  const glowResetPackage = await prisma.servicePackage.create({
    data: {
      business_id: beautyFeel.id,
      name: "Glow Reset Package",
      description:
        "Deep cleaning facial, whole body scrub, and foot spa for a full self-care reset.",
      price: 1650,
      duration: 165,
      category: "Skin",
      items: {
        create: [
          { service_id: requiredService("Deep cleaning facial").id, custom_price: 700 },
          { service_id: requiredService("Whole body scrub").id, custom_price: 650 },
          { service_id: requiredService("Foot spa").id, custom_price: 300 },
        ],
      },
    },
  });

  const lashReadyPackage = await prisma.servicePackage.create({
    data: {
      business_id: beautyFeel.id,
      name: "Lash Ready Package",
      description:
        "Classic eyelash extensions with eyebrow lamination for a polished everyday look.",
      price: 760,
      duration: 150,
      category: "Eyelash",
      items: {
        create: [
          { service_id: requiredService("Classic eyelash extensions").id, custom_price: 360 },
          { service_id: requiredService("Eyebrow lamination").id, custom_price: 400 },
        ],
      },
    },
  });

  const paydaySale = await prisma.saleEvent.create({
    data: {
      business_id: beautyFeel.id,
      title: "Payday Glow Weekend",
      description:
        "Limited slots for facials, lashes, and body care before the weekend rush.",
      start_date: daysFromToday(-2, 0),
      end_date: daysFromToday(12, 23, 59),
      discount_type: DiscountType.PERCENTAGE,
      discount_value: 15,
      slot_limit: 24,
      applicable_services: {
        connect: [
          { id: requiredService("Deep cleaning facial").id },
          { id: requiredService("Classic eyelash extensions").id },
          { id: requiredService("Whole body scrub").id },
          { id: requiredService("Foot spa").id },
        ],
      },
      applicable_packages: {
        connect: [{ id: glowResetPackage.id }, { id: lashReadyPackage.id }],
      },
    },
  });

  const customerSeeds = [
    ["Maria Santos", "maria.santos@example.com", "639171110001", "TRUSTED"],
    ["Angelica Reyes", "angelica.reyes@example.com", "639171110002", "TRUSTED"],
    ["Patricia Lim", "patricia.lim@example.com", "639171110003", "TRUSTED"],
    ["Sofia Mendoza", "sofia.mendoza@example.com", "639171110004", "NEW"],
    ["Camille Tan", "camille.tan@example.com", "639171110005", "TRUSTED"],
    ["Nicole Garcia", "nicole.garcia@example.com", "639171110006", "NEW"],
    ["Janelle Cruz", "janelle.cruz@example.com", "639171110007", "TRUSTED"],
    ["Bianca Flores", "bianca.flores@example.com", "639171110008", "TRUSTED"],
    ["Andrea Villanueva", "andrea.v@example.com", "639171110009", "NEW"],
    ["Rica Navarro", "rica.navarro@example.com", "639171110010", "TRUSTED"],
    ["Mae dela Cruz", "mae.dc@example.com", "639171110011", "NEW"],
    ["Trisha Bautista", "trisha.b@example.com", "639171110012", "TRUSTED"],
  ] as const;

  const customers = [];
  for (let i = 0; i < customerSeeds.length; i++) {
    const [name, email, phone, trust_tier] = customerSeeds[i];
    customers.push(
      await prisma.customer.create({
        data: {
          name,
          email,
          phone,
          trust_tier,
          business_id: beautyFeel.id,
          is_demo: true,
          created_at: new Date(Date.now() - (52 - i * 3) * DAY_MS),
        },
      }),
    );
  }

  const bookingPlans = [
    { customer: 0, employee: 0, service: "Manicure gel", day: -28, hour: 11, minute: 0, status: BookingStatus.COMPLETED, paid: true },
    { customer: 1, employee: 2, service: "Deep cleaning facial", day: -24, hour: 14, minute: 0, status: BookingStatus.COMPLETED, paid: true },
    { customer: 2, employee: 1, service: "60mins Swedish massage", day: -20, hour: 16, minute: 0, status: BookingStatus.COMPLETED, paid: true },
    { customer: 3, employee: 3, service: "Foot spa with regular gel", day: -18, hour: 10, minute: 30, status: BookingStatus.COMPLETED, paid: true },
    { customer: 4, employee: 2, service: "Carbon laser deluxe", day: -14, hour: 13, minute: 0, status: BookingStatus.COMPLETED, paid: true },
    { customer: 5, employee: 1, service: "Whole body scrub", day: -11, hour: 15, minute: 30, status: BookingStatus.COMPLETED, paid: true },
    { customer: 6, employee: 4, service: "Acne facial", day: -8, hour: 12, minute: 0, status: BookingStatus.COMPLETED, paid: true },
    { customer: 7, employee: 0, service: "Classic eyelash extensions", day: -6, hour: 17, minute: 0, status: BookingStatus.COMPLETED, paid: true, discount: 60 },
    { customer: 8, employee: 3, service: "Soft gel nail extensions", day: -4, hour: 13, minute: 30, status: BookingStatus.COMPLETED, paid: true },
    { customer: 9, employee: 4, service: "Hydraderma facial", day: -2, hour: 15, minute: 0, status: BookingStatus.COMPLETED, paid: true, discount: 150 },
    { customer: 10, employee: 2, service: "BB glow with cheek blush", day: 0, hour: 13, minute: 0, status: BookingStatus.ACCEPTED, paid: false, downpayment: 1150 },
    { customer: 11, employee: 0, service: "Volume", day: 0, hour: 16, minute: 0, status: BookingStatus.ACCEPTED, paid: false },
    { customer: 1, employee: 3, service: "90 mins Hot stone massage", day: 1, hour: 11, minute: 0, status: BookingStatus.ACCEPTED, paid: false, downpayment: 500 },
    { customer: 6, employee: 4, service: "Microneedling", day: 2, hour: 14, minute: 0, status: BookingStatus.ACCEPTED, paid: false, downpayment: 1750 },
    { customer: 4, employee: 2, service: "Lightening facial", day: 5, hour: 10, minute: 30, status: BookingStatus.ACCEPTED, paid: false },
    { customer: 8, employee: 1, service: "Brazilian", day: -3, hour: 18, minute: 0, status: BookingStatus.CANCELLED, paid: false },
  ];

  for (const plan of bookingPlans) {
    const service = requiredService(plan.service);
    const scheduledAt = daysFromToday(plan.day, plan.hour, plan.minute);
    const estimatedEnd = addMinutes(scheduledAt, service.duration ?? 60);
    const discount = plan.discount ?? 0;
    const finalPrice = service.price - discount;
    const amountPaid = plan.paid ? finalPrice : plan.downpayment ?? 0;
    const paymentStatus = plan.paid
      ? PaymentStatus.PAID
      : amountPaid > 0
        ? PaymentStatus.PARTIALLY_PAID
        : PaymentStatus.UNPAID;

    await prisma.booking.create({
      data: {
        business_id: beautyFeel.id,
        customer_id: customers[plan.customer].id,
        status: plan.status,
        payment_method: plan.paid ? PaymentMethod.CASH : PaymentMethod.ONLINE,
        payment_status: paymentStatus,
        amount_paid: amountPaid,
        grand_total: finalPrice,
        total_discount: discount,
        downpayment: plan.downpayment,
        downpayment_date: plan.downpayment ? addMinutes(scheduledAt, -120) : null,
        scheduled_at: scheduledAt,
        estimated_end: estimatedEnd,
        reminder_sent: plan.day <= 1,
        sale_event_id: discount > 0 ? paydaySale.id : null,
        is_demo: true,
        created_at: addMinutes(scheduledAt, -48 * 60),
        availed_services: {
          create: [
            {
              service_id: service.id,
              served_by_id: employees[plan.employee].id,
              served_by_type: ServiceProviderType.EMPLOYEE,
              price: service.price,
              estimated_cost: Math.round(service.price * 0.28),
              discount,
              discount_reason: discount > 0 ? "SALE_EVENT" : null,
              final_price: finalPrice,
              commission_base: finalPrice,
              status:
                plan.status === BookingStatus.COMPLETED
                  ? AvailedServiceStatus.COMPLETED
                  : plan.status === BookingStatus.CANCELLED
                    ? AvailedServiceStatus.CANCELLED
                    : AvailedServiceStatus.PENDING,
              claimed_at:
                plan.status === BookingStatus.COMPLETED
                  ? addMinutes(scheduledAt, -10)
                  : null,
              served_at: plan.status === BookingStatus.COMPLETED ? scheduledAt : null,
              completed_at:
                plan.status === BookingStatus.COMPLETED ? estimatedEnd : null,
              cancelled_at:
                plan.status === BookingStatus.CANCELLED
                  ? addMinutes(scheduledAt, -90)
                  : null,
              scheduled_at: scheduledAt,
              estimated_end: estimatedEnd,
            },
          ],
        },
        payments:
          amountPaid > 0
            ? {
                create: [
                  {
                    type: plan.paid
                      ? BookingPaymentType.FULL
                      : BookingPaymentType.DOWNPAYMENT,
                    status: BookingPaymentStatus.SUCCEEDED,
                    payment_method: plan.paid ? PaymentMethod.CASH : PaymentMethod.ONLINE,
                    amount_principal: amountPaid,
                    amount_charged: amountPaid,
                    paid_at: addMinutes(scheduledAt, plan.paid ? 20 : -120),
                    metadata: {
                      seeded: true,
                      channel: plan.paid ? "front_desk" : "qrph_demo",
                    },
                  },
                ],
              }
            : undefined,
        notes:
          plan.status === BookingStatus.CANCELLED
            ? {
                create: [
                  {
                    body: "Customer asked to rebook next week. Keep on callback list.",
                    created_by_user_id: ownerUser.id,
                  },
                ],
              }
            : undefined,
      },
    });
  }

  const walkInStart = daysFromToday(-1, 18, 30);
  await prisma.booking.create({
    data: {
      business_id: beautyFeel.id,
      is_anonymous_walk_in: true,
      customer_label: "Walk-in: tourist pair",
      status: BookingStatus.COMPLETED,
      payment_method: PaymentMethod.CASH,
      payment_status: PaymentStatus.PAID,
      amount_paid: 800,
      grand_total: 800,
      total_discount: 0,
      scheduled_at: walkInStart,
      estimated_end: addMinutes(walkInStart, 90),
      is_demo: true,
      availed_services: {
        create: [
          {
            service_id: requiredService("Whole legs").id,
            served_by_id: employees[1].id,
            served_by_type: ServiceProviderType.EMPLOYEE,
            price: 450,
            estimated_cost: 120,
            final_price: 450,
            commission_base: 450,
            status: AvailedServiceStatus.COMPLETED,
            served_at: walkInStart,
            completed_at: addMinutes(walkInStart, 60),
            scheduled_at: walkInStart,
            estimated_end: addMinutes(walkInStart, 60),
          },
          {
            service_id: requiredService("Underarm wax").id,
            served_by_id: employees[1].id,
            served_by_type: ServiceProviderType.EMPLOYEE,
            price: 350,
            estimated_cost: 90,
            final_price: 350,
            commission_base: 350,
            status: AvailedServiceStatus.COMPLETED,
            served_at: addMinutes(walkInStart, 60),
            completed_at: addMinutes(walkInStart, 90),
            scheduled_at: addMinutes(walkInStart, 60),
            estimated_end: addMinutes(walkInStart, 90),
          },
        ],
      },
    },
  });

  for (const employee of employees) {
    for (const day of [-6, -5, -4, -3, -2, -1, 0]) {
      const late = employee.id % 2 === 0 && day === -3;
      await prisma.employeeAttendance.create({
        data: {
          employee_id: employee.id,
          date: daysFromToday(day, 0),
          status: late ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
          time_in: daysFromToday(day, late ? 10 : 9, late ? 28 : 55),
          time_out: day === 0 ? null : daysFromToday(day, 19, 5),
          location_verified: true,
          latitude: 9.68294,
          longitude: 118.75246,
        },
      });
    }
  }

  const expenseSeeds = [
    [ExpenseCategory.SUPPLIES, 2480, "Facial serums and disposable towels", -9],
    [ExpenseCategory.MARKETING, 1800, "Boosted Payday Glow Weekend post", -7],
    [ExpenseCategory.UTILITIES, 4200, "Electricity and water bill", -5],
    [ExpenseCategory.SUPPLIES, 1350, "Wax beads and lash adhesive restock", -3],
    [ExpenseCategory.MAINTENANCE, 950, "Massage bed linen laundry", -1],
    [ExpenseCategory.RENT, 18000, "Studio rent allocation", -15],
  ] as const;

  for (const [category, amount, description, day] of expenseSeeds) {
    await prisma.expense.create({
      data: {
        business_id: beautyFeel.id,
        category,
        amount,
        description,
        date: daysFromToday(day, 12),
        created_by_user_id: ownerUser.id,
      },
    });
  }

  await prisma.voucher.createMany({
    data: [
      {
        business_id: beautyFeel.id,
        code: "BF-PAYDAY15",
        value: 15,
        type: VoucherType.PERCENTAGE,
        minimum_amount: 600,
        expires_at: daysFromToday(14, 23, 59),
      },
      {
        business_id: beautyFeel.id,
        code: "BF-NEWGLOW200",
        value: 200,
        type: VoucherType.FLAT,
        minimum_amount: 1200,
        expires_at: daysFromToday(30, 23, 59),
      },
    ],
  });

  const giftCard = await prisma.giftCard.create({
    data: {
      business_id: beautyFeel.id,
      code: "BF-GLOW-GIFT-001",
      customer_name: "For Tita Rose",
      customer_email: "rose.gift@example.com",
      customer_phone: "639171119999",
      expires_at: daysFromToday(90, 23, 59),
      included_services: {
        create: [
          { service_id: requiredService("Deep cleaning facial").id },
          { service_id: requiredService("Foot spa").id },
        ],
      },
    },
  });

  await prisma.giftCard.create({
    data: {
      business_id: beautyFeel.id,
      code: "BF-LASH-TREAT-002",
      customer_name: "Mika's Birthday Treat",
      customer_phone: "639171118888",
      expires_at: daysFromToday(60, 23, 59),
      is_claimed: true,
      claimed_at: daysFromToday(-2, 9),
      claimed_by_customer_id: customers[5].id,
      included_packages: {
        create: [{ package_id: lashReadyPackage.id }],
      },
    },
  });

  await prisma.serviceFlow.createMany({
    data: [
      {
        business_id: beautyFeel.id,
        trigger_service_id: requiredService("Deep cleaning facial").id,
        suggested_service_id: requiredService("Hydraderma facial").id,
        delay_duration: 21,
        delay_unit: FlowDelayUnit.DAYS,
        type: FlowType.SUGGESTED,
      },
      {
        business_id: beautyFeel.id,
        trigger_service_id: requiredService("Classic eyelash extensions").id,
        suggested_service_id: requiredService("Eyelash Perm with tint").id,
        delay_duration: 3,
        delay_unit: FlowDelayUnit.WEEKS,
        type: FlowType.SUGGESTED,
      },
      {
        business_id: beautyFeel.id,
        trigger_service_id: requiredService("Whole body scrub").id,
        suggested_service_id: requiredService("Lightening facial").id,
        delay_duration: 1,
        delay_unit: FlowDelayUnit.MONTHS,
        type: FlowType.SUGGESTED,
      },
    ],
  });

  const fbConnection = await prisma.socialConnection.create({
    data: {
      business_id: beautyFeel.id,
      platform: SocialPlatform.FACEBOOK_PAGE,
      external_account_id: "beautyfeel-demo-page",
      display_name: "BeautyFeel Puerto Princesa",
      username: "beautyfeel.ph",
      access_token_encrypted: "demo-token",
      scopes: ["pages_manage_posts", "pages_read_engagement"],
      status: SocialConnectionStatus.CONNECTED,
      last_sync_at: daysFromToday(0, 8),
    },
  });

  await prisma.socialPost.create({
    data: {
      business_id: beautyFeel.id,
      sale_event_id: paydaySale.id,
      source: SocialPostSource.SALE_EVENT,
      status: SocialPostStatus.READY,
      title: "Payday Glow Weekend",
      caption_draft:
        "Payday glow-up slots are open. Book facials, lashes, or a full self-care reset this weekend at BeautyFeel.",
      caption_final:
        "Payday glow-up slots are open at BeautyFeel. Reserve your facial, lashes, or full self-care reset before the weekend rush.",
      hashtags: ["#BeautyFeel", "#SelfCarePH", "#PuertoPrincesa", "#GlowUp"],
      created_by_user_id: ownerUser.id,
      publish_requested_at: daysFromToday(0, 9),
      targets: {
        create: [{ social_connection_id: fbConnection.id, status: "QUEUED" }],
      },
    },
  });

  await prisma.socialPost.create({
    data: {
      business_id: beautyFeel.id,
      source: SocialPostSource.MANUAL,
      status: SocialPostStatus.PUBLISHED,
      category: "SERVICE_SHOWCASE",
      title: "Hydraderma Facial Spotlight",
      caption_draft:
        "Dry skin week? Our Hydraderma facial gives your skin a calm, hydrated reset.",
      caption_final:
        "Dry skin week? Our Hydraderma facial gives your skin a calm, hydrated reset. Message us or book online.",
      hashtags: ["#BeautyFeel", "#Hydraderma", "#FacialCare"],
      created_by_user_id: ownerUser.id,
      published_at: daysFromToday(-3, 18),
      targets: {
        create: [
          {
            social_connection_id: fbConnection.id,
            status: "PUBLISHED",
            attempts: 1,
            remote_post_id: "demo-post-001",
            remote_permalink: "https://facebook.com/beautyfeel.ph/posts/demo-post-001",
            published_at: daysFromToday(-3, 18),
          },
        ],
      },
    },
  });

  const socialRequester = await prisma.employee.findUnique({
    where: { id: employees[2].id },
    select: { user_id: true },
  });

  await prisma.socialPostRequest.create({
    data: {
      business_id: beautyFeel.id,
      requested_by_user_id: socialRequester!.user_id,
      topic: "Before payday lash refill reminder",
      brief: "Invite clients to reserve lash refill slots before Friday afternoon.",
      category: "SOCIAL_REMINDER",
      desired_tone: "taglish-natural",
      due_date: daysFromToday(1, 12),
      status: "PENDING",
    },
  });

  await prisma.businessGrowthSettings.create({
    data: {
      business_id: beautyFeel.id,
      business_type: "SPA",
      max_discount_percent: 18,
      min_confidence_threshold: 0.45,
      enable_student_promo: true,
      tone_profile: "warm-premium-tagalog",
      avoid_cheap_wording: true,
      weather_hooks_enabled: true,
      profit_floor_percent: 35,
    },
  });

  console.log("\n✅ Seeding finished successfully!");
  console.log("   Owner   — Ellaine Pe       639170000001 / Ellainepe123");
  console.log("   Employee — Jan David Almirante 639170000010 / employee123");
  console.log("   Employee — Daniel Canoy        639170000011 / employee123");
  console.log(`   Demo customers: ${customers.length}`);
  console.log(`   Demo bookings: ${bookingPlans.length + 1}`);
  console.log(`   Demo gift card: ${giftCard.code}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
