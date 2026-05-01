import { hash } from "bcryptjs";
import { Role } from "./generated/prisma/client";
import { prisma } from "./prisma";

async function main() {
  console.log("Start seeding ...");

  // Clean up existing data
  await prisma.campaignEvent.deleteMany();
  await prisma.campaignAsset.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.growthContextSnapshot.deleteMany();
  await prisma.businessGrowthSettings.deleteMany();
  await prisma.seasonalCalendar.deleteMany();
  await prisma.platformActionLog.deleteMany();
  await prisma.onboardingApplication.deleteMany();
  await prisma.referralAttribution.deleteMany();
  await prisma.referralLead.deleteMany();
  await prisma.referralCode.deleteMany();
  await prisma.subscriptionInvoice.deleteMany();
  await prisma.subscriptionCreditLedger.deleteMany();
  await prisma.subscriptionPaymentMethod.deleteMany();
  await prisma.businessSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.availedService.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.packageItem.deleteMany();
  await prisma.servicePackage.deleteMany();
  await prisma.service.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employeeAttendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();

  const password = await hash("Ellainepe123", 12);
  const employeePassword = await hash("employee123", 12);

  // ============================================
  // 1. BUSINESS: BEAUTY FEEL
  // ============================================
  console.log(" Creating BeautyFeel...");

  const bfOwnerUser = await prisma.user.create({
    data: {
      email: "rjpern@gmail.com",
      name: "Ellaine Pe",
      hashed_password: password,
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
          user_id: bfOwnerUser.id,
          specialties: ["Skin"], // Owner specializes in Skin category
        },
      },
      latitude: 9.682940016270514,
      longitude: 118.75246245092016,
    },
  });

  const monthlyPlan = await prisma.subscriptionPlan.create({
    data: {
      code: "PRO_MONTHLY",
      name: "Pro Monthly",
      billing_interval: "MONTHLY",
      price_amount: 400_000,
      currency: "PHP",
      is_active: true,
    },
  });

  await prisma.subscriptionPlan.create({
    data: {
      code: "PRO_ANNUAL",
      name: "Pro Annual",
      billing_interval: "YEARLY",
      price_amount: 3_840_000,
      currency: "PHP",
      is_active: true,
    },
  });

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setMonth(trialEnd.getMonth() + 1);

  await prisma.businessSubscription.create({
    data: {
      business_id: beautyFeel.id,
      plan_id: monthlyPlan.id,
      status: "TRIALING",
      collection_method: "MANUAL_CHECKOUT",
      current_period_start: now,
      current_period_end: trialEnd,
      trial_ends_at: trialEnd,
      recurring_enabled: false,
    },
  });

  await prisma.referralCode.create({
    data: {
      business_id: beautyFeel.id,
      code: "SF-BEAUTYF",
      is_active: true,
    },
  });

  await prisma.seasonalCalendar.createMany({
    data: [
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-02-14T00:00:00+08:00`),
        event_name: "Valentine's Day",
        event_type: "HOLIDAY",
        weight: 0.95,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-12-25T00:00:00+08:00`),
        event_name: "Christmas Day",
        event_type: "HOLIDAY",
        weight: 1,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-01-01T00:00:00+08:00`),
        event_name: "New Year's Day",
        event_type: "HOLIDAY",
        weight: 0.9,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-03-01T00:00:00+08:00`),
        event_name: "Graduation Season Start",
        event_type: "SEASONAL",
        weight: 0.75,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-04-01T00:00:00+08:00`),
        event_name: "Summer Season",
        event_type: "SEASONAL",
        weight: 0.7,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-11-01T00:00:00+08:00`),
        event_name: "Holiday Rush Start",
        event_type: "SEASONAL",
        weight: 0.85,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-01-15T00:00:00+08:00`),
        event_name: "Payday Mid-Month",
        event_type: "PAYDAY",
        payday_rule: "DAY_15_30",
        weight: 0.8,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-01-30T00:00:00+08:00`),
        event_name: "Payday End-Month",
        event_type: "PAYDAY",
        payday_rule: "DAY_15_30",
        weight: 0.8,
      },
    ],
  });

  const adminEmail = process.env.SEED_PLATFORM_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const adminHash = await hash(adminPassword, 12);
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        name: "Platform Admin",
        hashed_password: adminHash,
        role: Role.PLATFORM_ADMIN,
      },
      update: {
        name: "Platform Admin",
        hashed_password: adminHash,
        role: Role.PLATFORM_ADMIN,
      },
    });
  }

  const days = Array.from({ length: 7 }, (_, i) => i);

  for (const d of days) {
    // 1. Spa Category: 10am to 10pm (Assuming general hours, can be adjusted)
    await prisma.businessHours.create({
      data: {
        business_id: beautyFeel.id,
        day_of_week: d,
        open_time: "10:00",
        close_time: "22:00",
        is_closed: false,
        category: "Spa",
      },
    });

    // 2. Nails Category: 10am to 10pm
    await prisma.businessHours.create({
      data: {
        business_id: beautyFeel.id,
        day_of_week: d,
        open_time: "10:00",
        close_time: "22:00",
        is_closed: false,
        category: "Nails",
      },
    });

    // 3. Skin Category: 10am to 10pm
    await prisma.businessHours.create({
      data: {
        business_id: beautyFeel.id,
        day_of_week: d,
        open_time: "10:00",
        close_time: "22:00",
        is_closed: false,
        category: "Skin",
      },
    });

    // 4. Eyelash Category: 10am to 10pm
    await prisma.businessHours.create({
      data: {
        business_id: beautyFeel.id,
        day_of_week: d,
        open_time: "10:00",
        close_time: "22:00",
        is_closed: false,
        category: "Eyelash",
      },
    });

    // 5. General fallback
    await prisma.businessHours.create({
      data: {
        business_id: beautyFeel.id,
        day_of_week: d,
        open_time: "10:00",
        close_time: "22:00",
        is_closed: false,
        category: "GENERAL",
      },
    });
  }

  // BF Services
  const bfServices = [
    // --- Nail Care (Category: Nails) ---
    {
      name: "Manicure gel",
      price: 280,
      duration: 60,
      category: "Nails",
      description: "Long-lasting gel polish application for hands.",
    },
    {
      name: "Pedicure gel",
      price: 300,
      duration: 60,
      category: "Nails",
      description: "Long-lasting gel polish application for feet.",
    },
    {
      name: "Foot spa",
      price: 250,
      duration: 45,
      category: "Nails",
      description: "Relaxing foot soak and scrub.",
    },
    {
      name: "Foot spa with regular gel",
      price: 430,
      duration: 75,
      category: "Nails",
      description: "Complete foot spa treatment with gel polish.",
    },
    {
      name: "Soft gel nail extensions",
      price: 699,
      duration: 120,
      category: "Nails",
      description: "Natural-looking soft gel extensions.",
    },
    {
      name: "Regular manicure",
      price: 150,
      duration: 45,
      category: "Nails",
      description: "Classic nail cleaning and polish.",
    },

    // --- Eyelash/Eyebrow Services (Category: Eyelash) ---
    {
      name: "Classic eyelash extensions",
      price: 399,
      duration: 90,
      category: "Eyelash",
      description: "Natural looking individual lash extensions.",
    },
    {
      name: "Wispy",
      price: 450,
      duration: 90,
      category: "Eyelash",
      description: "Textured, fluttery lash look.",
    },
    {
      name: "Doll eye",
      price: 450,
      duration: 90,
      category: "Eyelash",
      description: "Open-eye effect with longer lashes in the middle.",
    },
    {
      name: "Cat eye",
      price: 450,
      duration: 90,
      category: "Eyelash",
      description: "Elongated look with longer lashes at the corners.",
    },
    {
      name: "Volume",
      price: 500,
      duration: 120,
      category: "Eyelash",
      description: "Fuller, denser lash extensions.",
    },
    {
      name: "Eyelash Perming",
      price: 399,
      duration: 60,
      category: "Eyelash",
      description: "Semi-permanent lash curling.",
    },
    {
      name: "Eyelash Perm with tint",
      price: 450,
      duration: 75,
      category: "Eyelash",
      description: "Lash lift combined with darkening tint.",
    },
    {
      name: "Eyebrow lamination",
      price: 450,
      duration: 60,
      category: "Eyelash",
      description: "Brow smoothing and shaping treatment.",
    },

    // --- Waxing/Body Services (Category: Spa) ---
    {
      name: "Underarm wax",
      price: 350,
      duration: 30,
      category: "Spa",
      description: "Smooth underarm hair removal.",
    },
    {
      name: "Whole Arm",
      price: 350,
      duration: 45,
      category: "Spa",
      description: "Full arm hair removal.",
    },
    {
      name: "Half legs",
      price: 350,
      duration: 45,
      category: "Spa",
      description: "Lower leg hair removal.",
    },
    {
      name: "Whole legs",
      price: 450,
      duration: 60,
      category: "Spa",
      description: "Full leg hair removal.",
    },
    {
      name: "Brazilian",
      price: 800,
      duration: 60,
      category: "Spa",
      description: "Complete intimate waxing.",
    },
    {
      name: "Whole body scrub",
      price: 750,
      duration: 60,
      category: "Spa",
      description: "Exfoliating full body treatment.",
    },

    {
      name: "Deep cleaning facial",
      price: 800,
      duration: 60,
      category: "Skin",
      description: "Thorough cleansing and extraction.",
    },
    {
      name: "Lightening facial",
      price: 1200,
      duration: 60,
      category: "Skin",
      description: "Brightening treatment for uneven skin tone.",
    },
    {
      name: "Hydraderma facial",
      price: 1500,
      duration: 75,
      category: "Skin",
      description: "Intense hydration treatment.",
    },
    {
      name: "Wart treatment (minimum)",
      price: 800,
      duration: 30,
      category: "Skin",
      description: "Removal of skin warts.",
    },
    {
      name: "Acne facial",
      price: 999,
      duration: 75,
      category: "Skin",
      description: "Targeted treatment for acne-prone skin.",
    },
    {
      name: "BB glow with cheek blush",
      price: 2300,
      duration: 90,
      category: "Skin",
      description: "Semi-permanent foundation effect.",
    },
    {
      name: "Carbon laser deluxe",
      price: 1900,
      duration: 60,
      category: "Skin",
      description: "Laser treatment for pore reduction and glow.",
    },
    {
      name: "CO2 fractional laser",
      price: 5000,
      duration: 60,
      category: "Skin",
      description: "Advanced skin resurfacing.",
    },
    {
      name: "Microneedling",
      price: 3500,
      duration: 90,
      category: "Skin",
      description: "Collagen induction therapy.",
    },
    {
      name: "IPL (Hair growth treatment)",
      price: 500,
      duration: 45,
      category: "Skin",
      description: "Intense Pulsed Light for hair reduction.",
    },
    {
      name: "Exilift (price starts at)",
      price: 899,
      duration: 60,
      category: "Skin",
      description: "Non-surgical skin tightening.",
    },
    // {
    //   name: "Mesolipo (Fat shrinker)",
    //   price: 0, // "Soon..."
    //   duration: 60,
    //   category: "Skin",
    //   description: "Coming Soon...",
    // },
    // {
    //   name: "Skin Booster",
    //   price: 0, // "Soon..."
    //   duration: 60,
    //   category: "Skin",
    //   description: "Coming Soon...",
    // },
    {
      name: "Glutathione drip and push(price starts at)",
      price: 800,
      duration: 45,
      category: "Skin",
      description: "IV therapy for skin brightening.",
    },

    // --- Massage Therapy (Category: Spa) ---
    {
      name: "60mins Swedish massage",
      price: 500,
      duration: 60,
      category: "Spa",
      description: "Relaxing full body massage.",
    },
    {
      name: "60mins Combination massage",
      price: 600,
      duration: 60,
      category: "Spa",
      description: "Mix of Swedish and Shiatsu techniques.",
    },
    {
      name: "60mins Thai massage",
      price: 700,
      duration: 60,
      category: "Spa",
      description: "Stretching and deep pressure massage.",
    },
    {
      name: "60mins Siatsu massage",
      price: 700,
      duration: 60,
      category: "Spa",
      description: "Japanese pressure point massage.",
    },
    {
      name: "90 mins Traditional massage",
      price: 800,
      duration: 90,
      category: "Spa",
      description: "Healing traditional hilot massage.",
    },
    {
      name: "90 mins Hot stone massage",
      price: 999,
      duration: 90,
      category: "Spa",
      description: "Massage with heated basalt stones.",
    },
    {
      name: "90mins Ventossa massage",
      price: 999,
      duration: 90,
      category: "Spa",
      description: "Cupping therapy massage.",
    },
    {
      name: "Prenatal massage(DOH lic. Therapist only)",
      price: 500,
      duration: 60,
      category: "Spa",
      description: "Safe and soothing massage for expectant mothers.",
    },
    {
      name: "Pediatric massage",
      price: 500,
      duration: 60,
      category: "Spa",
      description: "Gentle massage for children.",
    },
    {
      name: "30mins back massage",
      price: 300,
      duration: 30,
      category: "Spa",
      description: "Focused relief for back tension.",
    },
    {
      name: "45mins back and head massage",
      price: 400,
      duration: 45,
      category: "Spa",
      description: "Relief for upper body stress.",
    },
    {
      name: "30mins Foot reflex and leg massage",
      price: 300,
      duration: 30,
      category: "Spa",
      description: "Pressure point foot therapy.",
    },
    {
      name: "45mins Foot reflex and leg massage",
      price: 400,
      duration: 45,
      category: "Spa",
      description: "Extended foot and leg therapy.",
    },
  ];

  for (const s of bfServices) {
    await prisma.service.create({ data: { ...s, business_id: beautyFeel.id } });
  }

  // BF Employees
  // (Updated based on new Categories: Nails, Skin, Eyelash, Spa)
  const bfEmployees = [
    {
      name: "Jan David Almirante",
      email: "jan@beautyfeel.com",
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
    },
    {
      name: "Daniel Canoy",
      email: "daniel@beautyfeel.com",
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
    },
  ];

  for (const emp of bfEmployees) {
    const u = await prisma.user.create({
      data: {
        email: emp.email,
        name: emp.name,
        hashed_password: employeePassword,
        role: Role.EMPLOYEE,
      },
    });
    await prisma.employee.create({
      data: {
        user_id: u.id,
        business_id: beautyFeel.id,
        salary: 0,
        daily_rate: 500 + Math.random() * 200,
        commission_percentage: 10,
        specialties: emp.specialties,
      },
    });
  }

  // ============================================
  // 2. SAMPLE CUSTOMERS + BOOKINGS
  // ============================================
  // Gives the staff CustomerPicker something to search against on first load,
  // exercises the duplicate-detection flow, populates customer rankings on
  // the Reports page, and includes one anonymous walk-in so the new
  // is_anonymous_walk_in metric surfaces.
  console.log(" Creating sample customers + bookings...");

  const bfServiceRows = await prisma.service.findMany({
    where: { business_id: beautyFeel.id },
    orderBy: { id: "asc" },
    take: 4,
  });
  const bfEmployeeRows = await prisma.employee.findMany({
    where: { business_id: beautyFeel.id },
    orderBy: { id: "asc" },
    take: 1,
  });
  const primaryEmployee = bfEmployeeRows[0] ?? null;

  if (bfServiceRows.length === 0) {
    console.log("   ⚠ Skipping sample bookings — no services to attach.");
  } else {
    const sampleCustomers = [
      { name: "Maria Santos", email: "maria.santos@example.com", phone: "639171234001", trust_tier: "TRUSTED", no_show_count: 0 },
      { name: "Juan dela Cruz", email: null, phone: "639171234002", trust_tier: "NEW", no_show_count: 0 },
      { name: "Ana Rodriguez", email: "ana.rodriguez@example.com", phone: "639171234003", trust_tier: "TRUSTED", no_show_count: 0 },
      { name: "Pedro Reyes", email: null, phone: "639171234004", trust_tier: "NEW", no_show_count: 0 },
      { name: "Sofia Mendoza", email: "sofia.mendoza@example.com", phone: "639171234005", trust_tier: "RESTRICTED", no_show_count: 2 },
    ] as const;

    const customerIdsByName = new Map<string, string>();
    for (const c of sampleCustomers) {
      const created = await prisma.customer.create({
        data: {
          name: c.name,
          email: c.email,
          phone: c.phone,
          trust_tier: c.trust_tier,
          no_show_count: c.no_show_count,
          last_no_show_at: c.no_show_count > 0 ? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) : null,
          business_id: beautyFeel.id,
        },
      });
      customerIdsByName.set(c.name, created.id);
    }

    const createSampleBooking = async (opts: {
      customerName: string | null;
      isAnonymousWalkIn?: boolean;
      customerLabel?: string | null;
      serviceIndex: number;
      daysAgo: number;
      status: "ACCEPTED" | "COMPLETED" | "CANCELLED";
      paid: boolean;
    }) => {
      const service = bfServiceRows[opts.serviceIndex % bfServiceRows.length];
      const scheduledAt = new Date(Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000);
      const estimatedEnd = new Date(scheduledAt.getTime() + (service.duration ?? 30) * 60 * 1000);
      const grandTotal = service.price;
      const customerId = opts.customerName ? customerIdsByName.get(opts.customerName) ?? null : null;

      await prisma.booking.create({
        data: {
          business_id: beautyFeel.id,
          customer_id: customerId,
          is_anonymous_walk_in: !!opts.isAnonymousWalkIn,
          customer_label: opts.customerLabel ?? null,
          status: opts.status,
          grand_total: grandTotal,
          total_discount: 0,
          payment_method: "CASH",
          payment_status: opts.paid ? "PAID" : "UNPAID",
          amount_paid: opts.paid ? grandTotal : 0,
          scheduled_at: scheduledAt,
          estimated_end: estimatedEnd,
          availed_services: {
            create: {
              price: service.price,
              estimated_cost: service.estimated_cost ?? 0,
              discount: 0,
              final_price: service.price,
              commission_base: service.price,
              status: opts.status === "COMPLETED" ? "COMPLETED" : "PENDING",
              service_id: service.id,
              served_by_id: opts.status === "COMPLETED" ? primaryEmployee?.id ?? null : null,
              served_by_type: opts.status === "COMPLETED" && primaryEmployee ? "EMPLOYEE" : null,
              served_at: opts.status === "COMPLETED" ? scheduledAt : null,
              completed_at: opts.status === "COMPLETED" ? estimatedEnd : null,
              scheduled_at: scheduledAt,
              estimated_end: estimatedEnd,
            },
          },
        },
      });
    }

    await createSampleBooking({ customerName: "Maria Santos", serviceIndex: 0, daysAgo: 30, status: "COMPLETED", paid: true });
    await createSampleBooking({ customerName: "Maria Santos", serviceIndex: 1, daysAgo: 14, status: "COMPLETED", paid: true });
    await createSampleBooking({ customerName: "Maria Santos", serviceIndex: 2, daysAgo: 3, status: "COMPLETED", paid: true });
    await createSampleBooking({ customerName: "Ana Rodriguez", serviceIndex: 1, daysAgo: 21, status: "COMPLETED", paid: true });
    await createSampleBooking({ customerName: "Ana Rodriguez", serviceIndex: 3, daysAgo: 7, status: "COMPLETED", paid: true });
    await createSampleBooking({ customerName: "Juan dela Cruz", serviceIndex: 2, daysAgo: 10, status: "COMPLETED", paid: true });
    await createSampleBooking({ customerName: "Pedro Reyes", serviceIndex: 0, daysAgo: 2, status: "ACCEPTED", paid: false });
    await createSampleBooking({ customerName: null, isAnonymousWalkIn: true, customerLabel: "Walk-in #1", serviceIndex: 0, daysAgo: 5, status: "COMPLETED", paid: true });
    await createSampleBooking({ customerName: null, isAnonymousWalkIn: true, customerLabel: "Tourist (cash)", serviceIndex: 3, daysAgo: 1, status: "COMPLETED", paid: true });

    console.log(`   ✓ Created ${sampleCustomers.length} customers and 9 bookings`);
  }

  console.log("\n✅ Seeding finished successfully!");
  console.log("\n📋 Accounts created with default credentials.");
  console.log("   See README or seed script for details.");
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
