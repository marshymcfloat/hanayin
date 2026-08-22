import { hash } from "bcryptjs";
import { Role, StaffPermission, StaffProfile } from "./generated/prisma/enums";
import { prisma } from "./prisma";
import { normalizePhilippinePhone } from "../lib/services/sms-otp";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

type ServiceSeed = readonly [string, number, number, string, string];
const services: ServiceSeed[] = [
  [
    "Manicure gel",
    280,
    60,
    "Nails",
    "Long-lasting gel polish application for hands.",
  ],
  [
    "Pedicure gel",
    300,
    60,
    "Nails",
    "Long-lasting gel polish application for feet.",
  ],
  ["Foot spa", 250, 45, "Nails", "Relaxing foot soak and scrub."],
  [
    "Foot spa with regular gel",
    430,
    75,
    "Nails",
    "Complete foot spa treatment with gel polish.",
  ],
  [
    "Soft gel nail extensions",
    699,
    120,
    "Nails",
    "Natural-looking soft gel extensions.",
  ],
  ["Regular manicure", 150, 45, "Nails", "Classic nail cleaning and polish."],
  [
    "Classic eyelash extensions",
    399,
    90,
    "Eyelash",
    "Natural-looking individual lash extensions.",
  ],
  ["Wispy", 450, 90, "Eyelash", "Textured, fluttery lash look."],
  ["Doll eye", 450, 90, "Eyelash", "Open-eye lash effect."],
  ["Cat eye", 450, 90, "Eyelash", "Elongated lash effect."],
  ["Volume", 500, 120, "Eyelash", "Fuller, denser lash extensions."],
  ["Eyelash Perming", 399, 60, "Eyelash", "Semi-permanent lash curling."],
  [
    "Eyelash Perm with tint",
    450,
    75,
    "Eyelash",
    "Lash lift with darkening tint.",
  ],
  [
    "Eyebrow lamination",
    450,
    60,
    "Eyelash",
    "Brow smoothing and shaping treatment.",
  ],
  ["Underarm wax", 350, 30, "Spa", "Smooth underarm hair removal."],
  ["Whole Arm", 350, 45, "Spa", "Full arm hair removal."],
  ["Half legs", 350, 45, "Spa", "Lower leg hair removal."],
  ["Whole legs", 450, 60, "Spa", "Full leg hair removal."],
  ["Brazilian", 800, 60, "Spa", "Complete intimate waxing."],
  ["Whole body scrub", 750, 60, "Spa", "Exfoliating full-body treatment."],
  [
    "Deep cleaning facial",
    800,
    60,
    "Skin",
    "Thorough cleansing and extraction.",
  ],
  [
    "Lightening facial",
    1200,
    60,
    "Skin",
    "Brightening treatment for uneven skin tone.",
  ],
  ["Hydraderma facial", 1500, 75, "Skin", "Intense hydration treatment."],
  ["Wart treatment (minimum)", 800, 30, "Skin", "Removal of skin warts."],
  ["Acne facial", 999, 75, "Skin", "Treatment for acne-prone skin."],
  [
    "BB glow with cheek blush",
    2300,
    90,
    "Skin",
    "Semi-permanent foundation effect.",
  ],
  ["Carbon laser deluxe", 1900, 60, "Skin", "Laser pore-reduction treatment."],
  ["CO2 fractional laser", 5000, 60, "Skin", "Advanced skin resurfacing."],
  ["Microneedling", 3500, 90, "Skin", "Collagen induction therapy."],
  [
    "IPL (Hair growth treatment)",
    500,
    45,
    "Skin",
    "Intense Pulsed Light treatment.",
  ],
  [
    "Exilift (price starts at)",
    899,
    60,
    "Skin",
    "Non-surgical skin tightening.",
  ],
  [
    "Glutathione drip and push (price starts at)",
    800,
    45,
    "Skin",
    "IV skin-brightening therapy.",
  ],
  ["60mins Swedish massage", 500, 60, "Spa", "Relaxing full-body massage."],
  [
    "60mins Combination massage",
    600,
    60,
    "Spa",
    "Swedish and Shiatsu techniques.",
  ],
  [
    "60mins Thai massage",
    700,
    60,
    "Spa",
    "Stretching and deep-pressure massage.",
  ],
  ["60mins Siatsu massage", 700, 60, "Spa", "Japanese pressure-point massage."],
  ["90 mins Traditional massage", 800, 90, "Spa", "Traditional hilot massage."],
  [
    "90 mins Hot stone massage",
    999,
    90,
    "Spa",
    "Massage with heated basalt stones.",
  ],
  ["90mins Ventossa massage", 999, 90, "Spa", "Cupping therapy massage."],
  [
    "Prenatal massage (DOH licensed therapist only)",
    500,
    60,
    "Spa",
    "Massage for expectant mothers.",
  ],
  ["Pediatric massage", 500, 60, "Spa", "Gentle massage for children."],
  ["30mins back massage", 300, 30, "Spa", "Focused relief for back tension."],
  ["45mins back and head massage", 400, 45, "Spa", "Upper-body stress relief."],
  [
    "30mins Foot reflex and leg massage",
    300,
    30,
    "Spa",
    "Pressure-point foot therapy.",
  ],
  [
    "45mins Foot reflex and leg massage",
    400,
    45,
    "Spa",
    "Extended foot and leg therapy.",
  ],
];

async function main() {
  const adminContact = normalizePhilippinePhone(
    requiredEnv("SEED_PLATFORM_ADMIN_CONTACT_NUMBER"),
  );
  const [adminHash, ownerHash, staffHash] = await Promise.all([
    hash(requiredEnv("SEED_PLATFORM_ADMIN_PASSWORD"), 12),
    hash("Ellainepe123", 12),
    hash("employee123", 12),
  ]);

  const admin = await prisma.user.create({
    data: {
      contact_number: adminContact,
      name: "Platform Admin",
      hashed_password: adminHash,
      role: Role.PLATFORM_ADMIN,
    },
  });
  const ownerUser = await prisma.user.create({
    data: {
      contact_number: "639170000001",
      name: "Ellaine Pe",
      hashed_password: ownerHash,
      role: Role.OWNER,
    },
  });
  const business = await prisma.business.create({
    data: {
      name: "BeautyFeel",
      slug: "beautyfeel",
      initials: "BF",
      description: "Beauty and wellness services in Puerto Princesa.",
      latitude: 9.682940016270514,
      longitude: 118.75246245092016,
      owners: {
        create: {
          user_id: ownerUser.id,
          specialties: ["Skin"],
          is_primary: true,
        },
      },
    },
  });
  const staffUser = await prisma.user.create({
    data: {
      contact_number: "639170000010",
      name: "Jan David Almirante",
      hashed_password: staffHash,
      role: Role.EMPLOYEE,
    },
  });
  await prisma.employee.create({
    data: {
      user_id: staffUser.id,
      business_id: business.id,
      salary: 0,
      daily_rate: 600,
      commission_percentage: 10,
      profile: StaffProfile.STAFF,
      permissions: [
        StaffPermission.BOOKING_CREATE,
        StaffPermission.QUEUE_CLAIM_SELF,
        StaffPermission.QUEUE_SERVE_SELF,
        StaffPermission.SOCIAL_POST_REQUEST_CREATE,
      ],
      specialties: ["Nails", "Spa", "Skin", "Eyelash"],
    },
  });

  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: "PRO_MONTHLY",
      name: "Pro Monthly",
      billing_interval: "MONTHLY",
      price_amount: 400_000,
      currency: "PHP",
    },
  });
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  await prisma.businessSubscription.create({
    data: {
      business_id: business.id,
      plan_id: plan.id,
      status: "ACTIVE",
      current_period_start: new Date(),
      current_period_end: periodEnd,
    },
  });
  await prisma.businessHours.createMany({
    data: Array.from({ length: 7 }, (_, day) =>
      ["Spa", "Nails", "Skin", "Eyelash", "GENERAL"].map((category) => ({
        business_id: business.id,
        day_of_week: day,
        open_time: "10:00",
        close_time: "22:00",
        category,
      })),
    ).flat(),
  });

  const createdServices = await Promise.all(
    services.map(([name, price, duration, category, description]) =>
      prisma.service.create({
        data: {
          business_id: business.id,
          name,
          price,
          duration,
          category,
          description,
        },
      }),
    ),
  );
  const byName = new Map(
    createdServices.map((service) => [service.name, service.id]),
  );
  const id = (name: string) => {
    const value = byName.get(name);
    if (!value) throw new Error(`Missing service: ${name}`);
    return value;
  };
  await prisma.servicePackage.create({
    data: {
      business_id: business.id,
      name: "Glow Reset Package",
      description: "Facial, body scrub, and foot spa.",
      price: 1650,
      duration: 165,
      category: "Skin",
      items: {
        create: [
          { service_id: id("Deep cleaning facial"), custom_price: 700 },
          { service_id: id("Whole body scrub"), custom_price: 650 },
          { service_id: id("Foot spa"), custom_price: 300 },
        ],
      },
    },
  });
  await prisma.servicePackage.create({
    data: {
      business_id: business.id,
      name: "Lash Ready Package",
      description: "Classic eyelash extensions and eyebrow lamination.",
      price: 760,
      duration: 150,
      category: "Eyelash",
      items: {
        create: [
          { service_id: id("Classic eyelash extensions"), custom_price: 360 },
          { service_id: id("Eyebrow lamination"), custom_price: 400 },
        ],
      },
    },
  });

  console.log("Seed complete");
  console.log(`Admin: ${admin.contact_number} / SEED_PLATFORM_ADMIN_PASSWORD`);
  console.log("Owner: 639170000001 / Ellainepe123");
  console.log("Staff: 639170000010 / employee123");
  console.log(`Services: ${createdServices.length}; packages: 2; users: 3`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
