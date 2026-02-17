import { hash } from "bcryptjs";
import { Role, StaffPermission, StaffProfile } from "./generated/prisma/client";
import { prisma } from "./prisma";

const DAY = 24 * 60 * 60 * 1000;
const money = (n: number) => Math.round(n * 100) / 100;
const ago = (base: Date, days: number, h = 0, m = 0) => {
  const d = new Date(base.getTime() - days * DAY);
  d.setHours(h, m, 0, 0);
  return d;
};
const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

type SeedEmp = {
  name: string;
  email: string;
  profile: StaffProfile;
  rate: number;
  commission: number;
  specialties: string[];
  permissions: StaffPermission[];
};

async function clean() {
  await prisma.campaignEvent.deleteMany();
  await prisma.campaignAsset.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.growthContextSnapshot.deleteMany();
  await prisma.businessGrowthSettings.deleteMany();
  await prisma.socialPostTarget.deleteMany();
  await prisma.socialPost.deleteMany();
  await prisma.socialConnection.deleteMany();
  await prisma.platformActionLog.deleteMany();
  await prisma.onboardingApplication.deleteMany();
  await prisma.referralAttribution.deleteMany();
  await prisma.referralLead.deleteMany();
  await prisma.referralCode.deleteMany();
  await prisma.subscriptionPlanUpgradeRequest.deleteMany();
  await prisma.subscriptionInvoice.deleteMany();
  await prisma.subscriptionCreditLedger.deleteMany();
  await prisma.subscriptionPaymentMethod.deleteMany();
  await prisma.businessSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.outboxMessage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.bookingPayment.deleteMany();
  await prisma.availedService.deleteMany();
  await prisma.giftCardService.deleteMany();
  await prisma.giftCardPackage.deleteMany();
  await prisma.giftCard.deleteMany();
  await prisma.voucher.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.packageItem.deleteMany();
  await prisma.serviceFlow.deleteMany();
  await prisma.servicePackage.deleteMany();
  await prisma.service.deleteMany();
  await prisma.saleEvent.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employeeAttendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.specialDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.seasonalCalendar.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log("Seeding...");
  await clean();
  const now = new Date();

  const ownerPw = await hash("Ellainepe123", 12);
  const empPw = await hash("employee123", 12);
  const adminEmail =
    process.env.SEED_PLATFORM_ADMIN_EMAIL ?? "platform-admin@serviceflow.local";
  const adminPw = process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? "platformadmin123";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: "Platform Admin",
      hashed_password: await hash(adminPw, 12),
      role: Role.PLATFORM_ADMIN,
    },
    update: { hashed_password: await hash(adminPw, 12), role: Role.PLATFORM_ADMIN },
  });

  const owner = await prisma.user.create({
    data: {
      email: "rjpern@gmail.com",
      name: "Ellaine Pe",
      hashed_password: ownerPw,
      role: Role.OWNER,
    },
  });

  const business = await prisma.business.create({
    data: {
      name: "BeautyFeel",
      slug: "beautyfeel",
      initials: "BF",
      description: "Manager + cashier structure, 7-day seeded activity.",
      latitude: 9.68294,
      longitude: 118.75246,
      structure: "MANAGER_CASHIER",
      allow_employee_self_booking: false,
      manager_can_serve: true,
      commission_calculation_basis: "DISCOUNTED_PRICE",
    },
  });

  await prisma.owner.create({
    data: { user_id: owner.id, business_id: business.id, specialties: ["Skin"] },
  });
  const convertedOwner = await prisma.user.create({
    data: {
      email: "owner@glowlane.com",
      name: "Ivy Ramos",
      hashed_password: ownerPw,
      role: Role.OWNER,
    },
  });

  const convertedBusiness = await prisma.business.create({
    data: {
      name: "GlowLane Studio",
      slug: "glowlane",
      initials: "GL",
      description: "Converted referral business",
      structure: "OWNER_EMPLOYEE_SELF_SERVICE",
    },
  });

  await prisma.owner.create({
    data: { user_id: convertedOwner.id, business_id: convertedBusiness.id, specialties: ["Nails"] },
  });

  const [starter, plus, pro] = await Promise.all([
    prisma.subscriptionPlan.create({
      data: { code: "STARTER_MONTHLY", name: "Starter Monthly", billing_interval: "MONTHLY", price_amount: 149_900 },
    }),
    prisma.subscriptionPlan.create({
      data: { code: "PLUS_MONTHLY", name: "Plus Monthly", billing_interval: "MONTHLY", price_amount: 249_900 },
    }),
    prisma.subscriptionPlan.create({
      data: { code: "PRO_MONTHLY", name: "Pro Monthly", billing_interval: "MONTHLY", price_amount: 399_900 },
    }),
  ]);

  const sub = await prisma.businessSubscription.create({
    data: {
      business_id: business.id,
      plan_id: plus.id,
      status: "ACTIVE",
      collection_method: "MANUAL_CHECKOUT",
      current_period_start: ago(now, 21),
      current_period_end: ago(now, -9),
      started_at: ago(now, 60),
    },
  });

  const convertedSub = await prisma.businessSubscription.create({
    data: {
      business_id: convertedBusiness.id,
      plan_id: starter.id,
      status: "TRIALING",
      collection_method: "MANUAL_CHECKOUT",
      trial_ends_at: ago(now, -20),
      current_period_start: ago(now, 6),
      current_period_end: ago(now, -20),
      started_at: ago(now, 6),
    },
  });

  await prisma.subscriptionPaymentMethod.create({
    data: {
      business_subscription_id: sub.id,
      provider: "PAYMONGO",
      provider_customer_id: "cus_bf_1",
      provider_payment_method_id: "pm_bf_1",
      brand: "Visa",
      last4: "4242",
    },
  });

  const trialCredit = await prisma.subscriptionCreditLedger.create({
    data: {
      business_subscription_id: sub.id,
      source: "TRIAL_GRANT",
      amount_total: 10_000,
      amount_remaining: 3_000,
      description: "Trial credit",
      awarded_by_user_id: admin.id,
      expires_at: ago(now, -45),
    },
  });

  const rewardCredit = await prisma.subscriptionCreditLedger.create({
    data: {
      business_subscription_id: sub.id,
      source: "REFERRAL_REWARD",
      amount_total: 5_000,
      amount_remaining: 5_000,
      description: "Referral reward",
      awarded_by_user_id: admin.id,
      expires_at: ago(now, -60),
    },
  });

  await prisma.subscriptionInvoice.createMany({
    data: [
      {
        business_subscription_id: sub.id,
        business_id: business.id,
        plan_id: plus.id,
        status: "PAID",
        period_start: ago(now, 51),
        period_end: ago(now, 21),
        due_at: ago(now, 20),
        amount_subtotal: plus.price_amount,
        amount_credit_applied: 2_000,
        amount_due: plus.price_amount - 2_000,
        amount_paid: plus.price_amount - 2_000,
        paid_at: ago(now, 19, 14),
      },
      {
        business_subscription_id: sub.id,
        business_id: business.id,
        plan_id: plus.id,
        status: "OPEN",
        period_start: ago(now, 21),
        period_end: ago(now, -9),
        due_at: ago(now, -2),
        amount_subtotal: plus.price_amount,
        amount_credit_applied: trialCredit.amount_remaining,
        amount_due: plus.price_amount - trialCredit.amount_remaining,
        amount_paid: 0,
      },
    ],
  });

  await prisma.subscriptionPlanUpgradeRequest.create({
    data: {
      business_id: business.id,
      business_subscription_id: sub.id,
      requested_by_user_id: owner.id,
      current_plan_id: plus.id,
      target_plan_id: pro.id,
      status: "APPROVED",
      request_note: "Need more reporting and growth automation",
      review_note: "Approved by platform admin",
      reviewed_by_user_id: admin.id,
      reviewed_at: ago(now, 3, 10),
    },
  });

  const refCode = await prisma.referralCode.create({
    data: { business_id: business.id, code: "SF-BEAUTYF", is_active: true },
  });
  await prisma.referralLead.create({
    data: {
      referral_code_id: refCode.id,
      referred_business_name: convertedBusiness.name,
      owner_name: "Ivy Ramos",
      owner_email: convertedOwner.email,
      owner_phone: "09178880001",
      notes: "Converted in less than a week",
      status: "CONVERTED",
      converted_business_id: convertedBusiness.id,
      created_at: ago(now, 6, 9),
      updated_at: ago(now, 2, 9),
    },
  });

  await prisma.referralAttribution.create({
    data: {
      referral_code_id: refCode.id,
      referrer_business_id: business.id,
      referred_business_id: convertedBusiness.id,
      status: "REWARDED",
      qualified_at: ago(now, 3, 10),
      rewarded_at: ago(now, 2, 11),
      reward_credit_ledger_id: rewardCredit.id,
    },
  });

  await prisma.onboardingApplication.create({
    data: {
      business_name: convertedBusiness.name,
      owner_name: "Ivy Ramos",
      owner_email: convertedOwner.email,
      owner_phone: "09178880001",
      notes: "Referral onboarding",
      requested_structure: "MANAGER_LED",
      requested_allow_employee_self_booking: false,
      requested_manager_can_serve: true,
      referral_code_input: refCode.code,
      referral_code_id: refCode.id,
      status: "CONVERTED",
      reviewed_by_user_id: admin.id,
      reviewed_at: ago(now, 2, 8),
      converted_business_id: convertedBusiness.id,
    },
  });

  await prisma.platformActionLog.create({
    data: {
      actor_user_id: admin.id,
      actor_email: admin.email,
      action: "BUSINESS_CONVERTED",
      target_type: "Business",
      target_id: convertedBusiness.id,
      business_id: convertedBusiness.id,
      metadata: { fromReferral: true },
    },
  });

  await prisma.seasonalCalendar.createMany({
    data: [
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-02-14T00:00:00+08:00`),
        event_name: "Valentines",
        event_type: "HOLIDAY",
        weight: 0.95,
      },
      {
        country_code: "PH",
        event_date: new Date(`${now.getFullYear()}-01-30T00:00:00+08:00`),
        event_name: "Payday",
        event_type: "PAYDAY",
        payday_rule: "DAY_15_30",
        weight: 0.82,
      },
    ],
  });

  for (let d = 0; d < 7; d += 1) {
    for (const c of ["GENERAL", "Spa", "Nails", "Skin", "Eyelash"]) {
      await prisma.businessHours.create({
        data: { business_id: business.id, day_of_week: d, category: c, open_time: "10:00", close_time: "22:00" },
      });
    }
  }

  const serviceSeeds = [
    ["Manicure Gel", 280, 60, "Nails"],
    ["Pedicure Gel", 320, 65, "Nails"],
    ["Deep Cleaning Facial", 850, 70, "Skin"],
    ["Hydraderma Facial", 1500, 80, "Skin"],
    ["Acne Facial", 999, 75, "Skin"],
    ["Swedish Massage", 500, 60, "Spa"],
    ["Hot Stone Massage", 999, 90, "Spa"],
    ["Classic Lash", 399, 90, "Eyelash"],
    ["Volume Lash", 520, 120, "Eyelash"],
  ] as const;

  const services = [];
  for (const [name, price, duration, category] of serviceSeeds) {
    services.push(
      await prisma.service.create({
        data: {
          business_id: business.id,
          name,
          price,
          duration,
          category,
          description: `${name} service`,
          estimated_cost: money(price * 0.32),
        },
      }),
    );
  }

  const pkg = await prisma.servicePackage.create({
    data: {
      business_id: business.id,
      name: "Skin Recovery Duo",
      description: "Deep clean + hydrate",
      price: 2100,
      duration: 150,
      category: "Skin",
    },
  });
  await prisma.packageItem.createMany({
    data: [
      { package_id: pkg.id, service_id: services[2].id, custom_price: 800 },
      { package_id: pkg.id, service_id: services[3].id, custom_price: 1200 },
    ],
  });

  await prisma.serviceFlow.create({
    data: {
      business_id: business.id,
      trigger_service_id: services[2].id,
      suggested_service_id: services[3].id,
      delay_duration: 2,
      delay_unit: "WEEKS",
      type: "SUGGESTED",
    },
  });

  const sale = await prisma.saleEvent.create({
    data: {
      business_id: business.id,
      title: "Recharge Week",
      description: "12% off selected skin/spa",
      start_date: ago(now, 2),
      end_date: ago(now, -4),
      discount_type: "PERCENTAGE",
      discount_value: 12,
      applicable_services: { connect: [{ id: services[2].id }, { id: services[5].id }] },
      applicable_packages: { connect: [{ id: pkg.id }] },
    },
  });

  await prisma.specialDate.create({
    data: { business_id: business.id, date: ago(now, 1), salary_multiplier: 1.2, commission_multiplier: 1.1 },
  });

  const emps: SeedEmp[] = [
    {
      name: "BeautyFeel Manager",
      email: "manager@beautyfeel.com",
      profile: StaffProfile.MANAGER,
      rate: 800,
      commission: 12,
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
      permissions: [
        StaffPermission.BOOKING_CREATE,
        StaffPermission.PAYMENT_COLLECT,
        StaffPermission.QUEUE_CLAIM_SELF,
        StaffPermission.QUEUE_SERVE_SELF,
        StaffPermission.QUEUE_OVERRIDE_ALL,
        StaffPermission.CATALOG_MANAGE,
      ],
    },
    {
      name: "BeautyFeel Cashier",
      email: "cashier@beautyfeel.com",
      profile: StaffProfile.CASHIER,
      rate: 620,
      commission: 4,
      specialties: ["GENERAL"],
      permissions: [StaffPermission.BOOKING_CREATE, StaffPermission.PAYMENT_COLLECT],
    },
    {
      name: "Jan David Almirante",
      email: "jan@beautyfeel.com",
      profile: StaffProfile.STAFF,
      rate: 650,
      commission: 10,
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
      permissions: [
        StaffPermission.BOOKING_CREATE,
        StaffPermission.PAYMENT_COLLECT,
        StaffPermission.QUEUE_CLAIM_SELF,
        StaffPermission.QUEUE_SERVE_SELF,
      ],
    },
    {
      name: "Daniel Canoy",
      email: "daniel@beautyfeel.com",
      profile: StaffProfile.STAFF,
      rate: 660,
      commission: 10,
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
      permissions: [
        StaffPermission.BOOKING_CREATE,
        StaffPermission.PAYMENT_COLLECT,
        StaffPermission.QUEUE_CLAIM_SELF,
        StaffPermission.QUEUE_SERVE_SELF,
      ],
    },
  ];
  const createdEmps: Array<{ id: number; user_id: string; profile: StaffProfile; rate: number }> = [];
  for (const e of emps) {
    const u = await prisma.user.create({
      data: { email: e.email, name: e.name, hashed_password: empPw, role: Role.EMPLOYEE },
    });
    const emp = await prisma.employee.create({
      data: {
        user_id: u.id,
        business_id: business.id,
        salary: 0,
        daily_rate: e.rate,
        commission_percentage: e.commission,
        profile: e.profile,
        specialties: e.specialties,
        permissions: e.permissions,
      },
    });
    createdEmps.push({ id: emp.id, user_id: u.id, profile: e.profile, rate: e.rate });
  }

  const manager = createdEmps.find((e) => e.profile === StaffProfile.MANAGER)!;
  const cashier = createdEmps.find((e) => e.profile === StaffProfile.CASHIER)!;
  const workers = createdEmps.filter((e) => e.profile !== StaffProfile.CASHIER);

  await prisma.customer.createMany({
    data: Array.from({ length: 14 }, (_, i) => ({
      business_id: business.id,
      name: `Customer ${i + 1}`,
      email: `customer${i + 1}@beautyfeel.test`,
      phone: `0917${String(500000 + i).padStart(6, "0")}`,
      created_at: ago(now, 10 - (i % 7), 9, i * 3),
    })),
  });
  const customers = await prisma.customer.findMany({ where: { business_id: business.id } });

  const vouchers = await prisma.voucher.createManyAndReturn({
    data: [
      {
        business_id: business.id,
        code: "WELCOME10",
        type: "PERCENTAGE",
        value: 10,
        minimum_amount: 800,
        expires_at: ago(now, -20),
      },
      {
        business_id: business.id,
        code: "SPA120",
        type: "FLAT",
        value: 120,
        minimum_amount: 1000,
        expires_at: ago(now, -10),
      },
    ],
  });

  const gift = await prisma.giftCard.create({
    data: {
      business_id: business.id,
      code: "GFT-001",
      customer_name: customers[0].name,
      customer_email: customers[0].email ?? "customer1@beautyfeel.test",
      expires_at: ago(now, -30),
      is_claimed: true,
      claimed_at: ago(now, 2, 16),
      claimed_by_customer_id: customers[0].id,
    },
  });
  await prisma.giftCardService.create({ data: { gift_card_id: gift.id, service_id: services[2].id } });
  await prisma.giftCardPackage.create({ data: { gift_card_id: gift.id, package_id: pkg.id } });

  const [fb, ig] = await Promise.all([
    prisma.socialConnection.create({
      data: {
        business_id: business.id,
        platform: "FACEBOOK_PAGE",
        external_account_id: "fb_1",
        display_name: "BeautyFeel FB",
        access_token_encrypted: "enc_fb",
        status: "CONNECTED",
      },
    }),
    prisma.socialConnection.create({
      data: {
        business_id: business.id,
        platform: "INSTAGRAM_BUSINESS",
        external_account_id: "ig_1",
        display_name: "BeautyFeel IG",
        access_token_encrypted: "enc_ig",
        status: "CONNECTED",
      },
    }),
  ]);

  const post = await prisma.socialPost.create({
    data: {
      business_id: business.id,
      sale_event_id: sale.id,
      source: "SALE_EVENT",
      status: "PUBLISHED",
      title: "Recharge Week Live",
      caption_draft: "Draft caption",
      caption_final: "Recharge Week now live",
      hashtags: ["#BeautyFeel", "#RechargeWeek"],
      created_by_user_id: owner.id,
      published_at: ago(now, 2, 10),
    },
  });
  await prisma.socialPostTarget.createMany({
    data: [
      { social_post_id: post.id, social_connection_id: fb.id, status: "PUBLISHED", attempts: 1 },
      { social_post_id: post.id, social_connection_id: ig.id, status: "PUBLISHED", attempts: 1 },
    ],
  });

  const snap = await prisma.growthContextSnapshot.create({
    data: {
      business_id: business.id,
      snapshot_date: ago(now, 0, 7),
      window_start: ago(now, 1),
      window_end: ago(now, 0, 23, 59),
      context_json: { bookings: 24, noShows: 2 },
      capacity_summary_json: { staffedSlots: 40, usedSlots: 31 },
      demand_summary_json: { topCategory: "Skin" },
      weather_summary_json: { condition: "Sunny" },
    },
  });

  const opp = await prisma.opportunity.create({
    data: {
      business_id: business.id,
      snapshot_id: snap.id,
      type: "SLOW_HOURS",
      status: "OPEN",
      reason: "Low utilization 2-5PM",
      time_window_start: ago(now, 0, 14),
      time_window_end: ago(now, -2, 17),
      urgency_score: 0.64,
      impact_score: 0.71,
      confidence_score: 0.69,
      feasibility_score: 0.8,
      total_score: 0.71,
      recommended_offer_types: ["FLASH_DEAL", "LIMITED_SLOTS"],
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      business_id: business.id,
      opportunity_id: opp.id,
      status: "READY",
      title: "2PM Flash Deal",
      offer_type: "FLASH_DEAL",
      offer_json: { discount: 12 },
      schedule_json: { start: ago(now, 0, 14), end: ago(now, 0, 17) },
      why_this_suggested: "Supports low-utilization period",
      sale_event_id: sale.id,
      social_post_id: post.id,
      created_by_user_id: manager.user_id,
    },
  });

  await prisma.campaignAsset.create({
    data: { campaign_id: campaign.id, type: "CAPTION", variant_label: "A", content: { text: "Flash deal" } },
  });
  await prisma.campaignEvent.create({
    data: { campaign_id: campaign.id, event_type: "POST_PUBLISHED", occurred_at: ago(now, 0, 14, 10) },
  });

  await prisma.businessGrowthSettings.create({
    data: {
      business_id: business.id,
      business_type: "SPA",
      max_discount_percent: 25,
      enable_student_promo: true,
      weather_hooks_enabled: true,
      avoid_cheap_wording: true,
      tone_profile: "taglish-natural",
    },
  });
  await prisma.leaveRequest.create({
    data: {
      employee_id: createdEmps[3].id,
      business_id: business.id,
      start_date: ago(now, 2),
      end_date: ago(now, 2),
      reason: "Emergency errand",
      type: "EMERGENCY",
      status: "APPROVED",
      is_paid: false,
      admin_comment: "Approved by manager",
    },
  });

  for (let d = 6; d >= 0; d -= 1) {
    for (const e of createdEmps) {
      const day = ago(now, d);
      const leave = e.id === createdEmps[3].id && d === 2;
      const off = e.id === cashier.id && day.getDay() === 0;
      const late = e.id === manager.id && d === 1;
      const status: "PRESENT" | "LEAVE" | "OFF" | "LATE" = leave
        ? "LEAVE"
        : off
          ? "OFF"
          : late
            ? "LATE"
            : "PRESENT";
      await prisma.employeeAttendance.create({
        data: {
          employee_id: e.id,
          date: day,
          status,
          time_in: status === "PRESENT" ? ago(now, d, 9, 58) : status === "LATE" ? ago(now, d, 10, 25) : null,
          time_out: status === "PRESENT" || status === "LATE" ? ago(now, d, 19, 5) : null,
          location_verified: status === "PRESENT" || status === "LATE",
          latitude: status === "PRESENT" || status === "LATE" ? business.latitude : null,
          longitude: status === "PRESENT" || status === "LATE" ? business.longitude : null,
          is_paid_leave: leave,
        },
      });
    }
  }

  const bookingIds: number[] = [];
  let voucherBooking: number | null = null;

  for (let d = 6; d >= 0; d -= 1) {
    for (let s = 0; s < 4; s += 1) {
      const customer = pick(customers, d * 4 + s);
      const scheduled = ago(now, d, 10 + s * 2);
      const a = pick(services, d + s);
      const b = pick(services, d + s + 2);
      const discount = d <= 2 && s % 2 === 0 ? money(a.price * 0.12) : 0;
      const subtotal = money(a.price + b.price);
      const totalDiscount = money(discount + (d === 1 && s === 1 ? 100 : 0));
      const total = money(subtotal - totalDiscount);

      const status: "COMPLETED" | "ACCEPTED" | "HOLD" | "CANCELLED" =
        d === 0 && s === 2
          ? "HOLD"
          : d === 0 && s === 3
            ? "ACCEPTED"
            : s === 3 && d % 2 === 0
              ? "CANCELLED"
              : "COMPLETED";

      const method: "CASH" | "QRPH" = s % 2 === 0 ? "CASH" : "QRPH";
      const partial = status === "COMPLETED" && method === "QRPH" && s % 3 === 0;
      const paid = status === "COMPLETED" ? (partial ? money(total * 0.4) : total) : 0;
      const pStatus: "PAID" | "PARTIALLY_PAID" | "UNPAID" =
        status === "COMPLETED" ? (partial ? "PARTIALLY_PAID" : "PAID") : "UNPAID";

      const booking = await prisma.booking.create({
        data: {
          customer_id: customer.id,
          business_id: business.id,
          status,
          payment_method: method,
          payment_status: pStatus,
          amount_paid: paid,
          paymongo_payment_intent_id: method === "QRPH" ? `pi_${d}_${s}_${Date.now()}` : null,
          grand_total: total,
          total_discount: totalDiscount,
          downpayment: partial ? paid : null,
          downpayment_status: partial ? "ACCEPTED" : null,
          downpayment_date: partial ? addMin(scheduled, 15) : null,
          scheduled_at: scheduled,
          estimated_end: addMin(scheduled, (a.duration ?? 60) + (b.duration ?? 60)),
          hold_expires_at: status === "HOLD" ? addMin(scheduled, 45) : null,
          created_at: addMin(scheduled, -60),
        },
      });

      if (d === 1 && s === 1) voucherBooking = booking.id;
      bookingIds.push(booking.id);

      const worker = pick(workers, d + s);
      const avStatusA: "PENDING" | "CLAIMED" | "SERVING" | "COMPLETED" | "CANCELLED" =
        status === "COMPLETED"
          ? "COMPLETED"
          : status === "CANCELLED"
            ? "CANCELLED"
            : "PENDING";

      const avStatusB: "PENDING" | "CLAIMED" | "SERVING" | "COMPLETED" | "CANCELLED" =
        status === "COMPLETED"
          ? "COMPLETED"
          : status === "CANCELLED"
            ? "CANCELLED"
            : status === "HOLD"
              ? "PENDING"
              : s % 2 === 0
                ? "CLAIMED"
                : "SERVING";

      await prisma.availedService.createMany({
        data: [
          {
            booking_id: booking.id,
            service_id: a.id,
            price: a.price,
            estimated_cost: a.estimated_cost,
            discount,
            discount_reason: discount > 0 ? "SALE_EVENT" : null,
            final_price: money(a.price - discount),
            commission_base: money(a.price - discount),
            status: avStatusA,
            claimed_at: avStatusA === "COMPLETED" ? addMin(scheduled, -10) : null,
            served_at: avStatusA === "COMPLETED" ? scheduled : null,
            completed_at: avStatusA === "COMPLETED" ? addMin(scheduled, a.duration ?? 60) : null,
            cancelled_at: avStatusA === "CANCELLED" ? addMin(scheduled, 10) : null,
            served_by_id: avStatusA === "COMPLETED" ? worker.id : null,
            served_by_type: avStatusA === "COMPLETED" ? "EMPLOYEE" : null,
            scheduled_at: scheduled,
            estimated_end: addMin(scheduled, a.duration ?? 60),
          },
          {
            booking_id: booking.id,
            service_id: b.id,
            package_id: s % 3 === 0 ? pkg.id : null,
            price: b.price,
            estimated_cost: b.estimated_cost,
            discount: 0,
            final_price: b.price,
            commission_base: b.price,
            status: avStatusB,
            claimed_at:
              avStatusB === "CLAIMED" || avStatusB === "SERVING" || avStatusB === "COMPLETED"
                ? addMin(scheduled, 30)
                : null,
            served_at: avStatusB === "SERVING" || avStatusB === "COMPLETED" ? addMin(scheduled, 40) : null,
            completed_at: avStatusB === "COMPLETED" ? addMin(scheduled, 40 + (b.duration ?? 60)) : null,
            cancelled_at: avStatusB === "CANCELLED" ? addMin(scheduled, 30) : null,
            served_by_id: avStatusB !== "PENDING" && avStatusB !== "CANCELLED" ? worker.id : null,
            served_by_type: avStatusB !== "PENDING" && avStatusB !== "CANCELLED" ? "EMPLOYEE" : null,
            scheduled_at: addMin(scheduled, a.duration ?? 60),
            estimated_end: addMin(scheduled, (a.duration ?? 60) + (b.duration ?? 60)),
          },
        ],
      });
      if (status === "COMPLETED") {
        if (partial) {
          const remaining = money(total - paid);
          await prisma.bookingPayment.createMany({
            data: [
              {
                booking_id: booking.id,
                type: "DOWNPAYMENT",
                status: "SUCCEEDED",
                payment_method: "QRPH",
                amount_principal: paid,
                amount_charged: paid,
                paymongo_payment_intent_id: `pi_dp_${booking.id}`,
                paymongo_payment_id: `pay_dp_${booking.id}`,
                paid_at: addMin(scheduled, 15),
              },
              {
                booking_id: booking.id,
                type: "BALANCE",
                status: "PENDING",
                payment_method: "QRPH",
                amount_principal: remaining,
                amount_charged: remaining,
                paymongo_payment_intent_id: `pi_bal_${booking.id}`,
                expires_at: addMin(scheduled, 1440),
              },
            ],
          });
        } else {
          await prisma.bookingPayment.create({
            data: {
              booking_id: booking.id,
              type: method === "CASH" ? "MANUAL" : "FULL",
              status: "SUCCEEDED",
              payment_method: method,
              amount_principal: total,
              amount_charged: total,
              paymongo_payment_intent_id: method === "QRPH" ? `pi_full_${booking.id}` : null,
              paymongo_payment_id: method === "QRPH" ? `pay_full_${booking.id}` : null,
              paid_at: addMin(scheduled, 20),
            },
          });
        }
      }
    }
  }

  if (voucherBooking) {
    await prisma.voucher.update({ where: { id: vouchers[0].id }, data: { used_by_id: voucherBooking } });
  }

  for (const e of createdEmps) {
    await prisma.payslip.createMany({
      data: [
        {
          employee_id: e.id,
          starting_date: ago(now, 14),
          ending_date: ago(now, 7),
          total_salary: money(e.rate * 6 + 1200),
          status: "PAID",
        },
        {
          employee_id: e.id,
          starting_date: ago(now, 6),
          ending_date: ago(now, 0),
          total_salary: money(e.rate * 6 + 900),
          status: "PENDING",
        },
      ],
    });
  }

  await prisma.outboxMessage.createMany({
    data: [
      {
        business_id: business.id,
        event_type: "BOOKING_CREATED",
        aggregate_type: "Booking",
        aggregate_id: String(bookingIds[0]),
        payload: { bookingId: bookingIds[0] },
        processed: true,
        processed_at: ago(now, 1, 12),
        attempts: 1,
      },
      {
        business_id: business.id,
        event_type: "PAYMENT_CONFIRMED",
        aggregate_type: "Booking",
        aggregate_id: String(bookingIds[1]),
        payload: { bookingId: bookingIds[1] },
        processed: false,
        attempts: 0,
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        business_id: business.id,
        entity_type: "Booking",
        entity_id: String(bookingIds[0]),
        action: "CREATED",
        actor_id: cashier.user_id,
        actor_type: "USER",
        changes: { status: "ACCEPTED" },
      },
      {
        business_id: business.id,
        entity_type: "Booking",
        entity_id: String(bookingIds[0]),
        action: "STATUS_CHANGED",
        actor_id: manager.user_id,
        actor_type: "USER",
        changes: { from: "ACCEPTED", to: "COMPLETED" },
      },
    ],
  });

  console.log("Done.");
  console.log("owner: rjpern@gmail.com / Ellainepe123");
  console.log("manager: manager@beautyfeel.com / employee123");
  console.log("cashier: cashier@beautyfeel.com / employee123");
  console.log("employee: jan@beautyfeel.com / employee123");
  console.log("employee: daniel@beautyfeel.com / employee123");
  console.log(`platform admin: ${adminEmail} / ${adminPw}`);
  console.log(`converted trial subscription: ${convertedSub.id}`);
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
