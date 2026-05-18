import { hash } from "bcryptjs";
import { Role } from "./generated/prisma/client";
import { prisma } from "./prisma";

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

  for (const s of bfServices) {
    await prisma.service.create({ data: { ...s, business_id: beautyFeel.id } });
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
  ];

  for (const emp of bfEmployees) {
    const u = await prisma.user.create({
      data: {
        contact_number: emp.contact_number,
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
        daily_rate: 600,
        commission_percentage: 10,
        specialties: emp.specialties,
      },
    });
  }

  console.log("\n✅ Seeding finished successfully!");
  console.log("   Owner   — Ellaine Pe       639170000001 / Ellainepe123");
  console.log("   Employee — Jan David Almirante 639170000010 / employee123");
  console.log("   Employee — Daniel Canoy        639170000011 / employee123");
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
