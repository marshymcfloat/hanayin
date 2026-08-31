import { hash } from "bcryptjs";
import crypto from "crypto";
import { Role } from "./generated/prisma/enums";
import { prisma } from "./prisma";
import { normalizePhilippinePhone } from "../lib/services/sms-otp";
import { sendEmployeeInviteSms } from "../lib/services/employee-invite";

const PASSWORD = "Ellainepe123";
const OWNER_CONTACT_NUMBER = "09274603088";
const EMPLOYEE_LOGIN_URL = "http://serviceflow.store/login";
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TEMP_PASSWORD_LENGTH = 6;
const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; database was not reset.`);
  return value;
}

function generateTempPassword() {
  let output = "";
  for (let index = 0; index < TEMP_PASSWORD_LENGTH; index += 1) {
    output +=
      TEMP_PASSWORD_ALPHABET[crypto.randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return output;
}

type EmployeeSeed = {
  name: string;
  contactNumber: string;
  specialty: string;
};

const employees: EmployeeSeed[] = [
  {
    name: "Mary",
    contactNumber: "09463821244",
    specialty: "Nail Care Services",
  },
  {
    name: "Rose",
    contactNumber: "09925371019",
    specialty: "Nail Care Services",
  },
  {
    name: "Jhed",
    contactNumber: "09936682729",
    specialty: "Nail Care Services",
  },
  {
    name: "Ritchel",
    contactNumber: "09708209047",
    specialty: "Nail Care Services",
  },
  {
    name: "Cath",
    contactNumber: "09930507919",
    specialty: "Eyelash/Eyebrow Services",
  },
  {
    name: "Gia",
    contactNumber: "09700459647",
    specialty: "Eyelash/Eyebrow Services",
  },
  {
    name: "Jeza",
    contactNumber: "09153121711",
    specialty: "Eyelash/Eyebrow Services",
  },
  { name: "Myra", contactNumber: "09977127119", specialty: "Massage Therapy" },
  { name: "Diane", contactNumber: "09166267592", specialty: "Massage Therapy" },
  {
    name: "Eunice",
    contactNumber: "09482163046",
    specialty: "Massage Therapy",
  },
  { name: "Rose", contactNumber: "09758477068", specialty: "Massage Therapy" },
  {
    name: "Stella",
    contactNumber: "09693623016",
    specialty: "Massage Therapy",
  },
];

type ServiceSeed = readonly [string, number, number, string];
const services: ServiceSeed[] = [
  ["Manicure gel", 280, 60, "Nail Care Services"],
  ["Pedicure gel", 300, 60, "Nail Care Services"],
  ["Foot spa", 250, 45, "Nail Care Services"],
  ["Foot spa with regular polish", 400, 75, "Nail Care Services"],
  ["Soft gel nail extensions", 699, 120, "Nail Care Services"],
  ["Regular manicure", 180, 45, "Nail Care Services"],
  ["Classic eyelash extensions", 399, 90, "Eyelash/Eyebrow Services"],
  ["Wispy", 450, 90, "Eyelash/Eyebrow Services"],
  ["Doll eye", 450, 90, "Eyelash/Eyebrow Services"],
  ["Cat eye", 450, 90, "Eyelash/Eyebrow Services"],
  ["Volume", 500, 120, "Eyelash/Eyebrow Services"],
  ["Eyelash perming", 399, 60, "Eyelash/Eyebrow Services"],
  ["Eyelash perm with tint", 450, 75, "Eyelash/Eyebrow Services"],
  ["Eyebrow lamination", 450, 60, "Eyelash/Eyebrow Services"],
  ["Classic Design - Natural look", 400, 90, "Eyelash/Eyebrow Services"],
  ["Classic Design - Cat eye", 450, 90, "Eyelash/Eyebrow Services"],
  ["Classic Design - Doll eye", 450, 90, "Eyelash/Eyebrow Services"],
  ["Korean Design - Natural Mapping", 450, 90, "Eyelash/Eyebrow Services"],
  ["Korean Design - Cat eye", 500, 90, "Eyelash/Eyebrow Services"],
  ["Korean Design - Doll eye", 500, 90, "Eyelash/Eyebrow Services"],
  ["Hybrid Design - Natural look", 450, 90, "Eyelash/Eyebrow Services"],
  ["Hybrid Design - Cat eye", 480, 90, "Eyelash/Eyebrow Services"],
  ["Hybrid Design - Doll eye", 480, 90, "Eyelash/Eyebrow Services"],
  ["Volume Design - Natural Mapping", 500, 120, "Eyelash/Eyebrow Services"],
  ["Volume Design - Cat eye", 550, 120, "Eyelash/Eyebrow Services"],
  ["Volume Design - Doll eye", 550, 120, "Eyelash/Eyebrow Services"],
  ["Wispy Design - Natural Mapping", 450, 90, "Eyelash/Eyebrow Services"],
  ["Wispy Design - Cat eye", 550, 90, "Eyelash/Eyebrow Services"],
  ["Wispy Design - Doll eye", 550, 90, "Eyelash/Eyebrow Services"],
  ["Wet Look Design - Natural Mapping", 450, 90, "Eyelash/Eyebrow Services"],
  ["Wet Look Design - Cat eye", 500, 90, "Eyelash/Eyebrow Services"],
  ["Wet Look Design - Doll eye", 500, 90, "Eyelash/Eyebrow Services"],
  ["Lash perm", 400, 60, "Eyelash/Eyebrow Services"],
  ["Lash perm with tint", 450, 75, "Eyelash/Eyebrow Services"],
  ["Brow lamination", 400, 60, "Eyelash/Eyebrow Services"],
  ["Brow lamination with tint", 450, 75, "Eyelash/Eyebrow Services"],
  ["Whitening body scrub", 750, 60, "Waxing/Body Services"],
  ["Eyebrows waxing", 250, 30, "Waxing/Body Services"],
  ["Underarm wax", 350, 30, "Waxing/Body Services"],
  ["Whole arm wax", 350, 45, "Waxing/Body Services"],
  ["Half legs wax", 350, 45, "Waxing/Body Services"],
  ["Whole legs wax", 450, 60, "Waxing/Body Services"],
  ["Whole legs wax (Men)", 700, 60, "Waxing/Body Services"],
  ["Whole legs wax (Women)", 600, 60, "Waxing/Body Services"],
  ["Brazilian wax", 800, 60, "Waxing/Body Services"],
  ["Bikini wax", 500, 45, "Waxing/Body Services"],
  ["Whole body scrub", 500, 60, "Waxing/Body Services"],
  ["Deep cleaning facial", 800, 60, "Skin Treatment"],
  ["Lightening facial", 1200, 60, "Skin Treatment"],
  ["Hydraderma facial", 1500, 75, "Skin Treatment"],
  ["Wart treatment (minimum)", 899, 30, "Skin Treatment"],
  ["Acne facial", 999, 75, "Skin Treatment"],
  ["BB glow with cheek blush", 2300, 90, "Skin Treatment"],
  ["Carbon laser deluxe", 1900, 60, "Skin Treatment"],
  ["CO2 fractional laser", 5000, 60, "Skin Treatment"],
  ["Microneedling", 3500, 90, "Skin Treatment"],
  ["IPL (Hair growth treatment)", 500, 45, "Skin Treatment"],
  ["Exilift (price starts at)", 899, 60, "Skin Treatment"],
  ["Mesolipo (fat shrinker)", 1000, 60, "Skin Treatment"],
  ["Skin booster", 3000, 60, "Skin Treatment"],
  ["Glutathione drip and push (price starts at)", 800, 45, "Skin Treatment"],
  ["60mins Swedish massage", 500, 60, "Massage Therapy"],
  ["60mins Combination massage", 600, 60, "Massage Therapy"],
  ["60mins Thai massage", 900, 60, "Massage Therapy"],
  ["60mins Shiatsu massage", 850, 60, "Massage Therapy"],
  ["90mins Traditional massage", 975, 90, "Massage Therapy"],
  ["90mins Hot stone massage", 1300, 90, "Massage Therapy"],
  ["90mins Ventosa massage", 1300, 90, "Massage Therapy"],
  [
    "Prenatal massage (DOH licensed therapist only)",
    500,
    60,
    "Massage Therapy",
  ],
  ["Pediatric massage", 500, 60, "Massage Therapy"],
  ["30mins back massage", 300, 30, "Massage Therapy"],
  ["45mins back and head massage", 400, 45, "Massage Therapy"],
  ["30mins Foot reflex and leg massage", 300, 30, "Massage Therapy"],
  ["45mins Foot reflex and leg massage", 400, 45, "Massage Therapy"],
];

async function main() {
  const adminContact = normalizePhilippinePhone(
    requiredEnv("SEED_PLATFORM_ADMIN_CONTACT_NUMBER"),
  );
  const adminPassword = requiredEnv("SEED_PLATFORM_ADMIN_PASSWORD");
  requiredEnv("SEMAPHORE_API");

  const ownerContact = normalizePhilippinePhone(OWNER_CONTACT_NUMBER);
  const normalizedEmployeeContacts = employees.map((employee) =>
    normalizePhilippinePhone(employee.contactNumber),
  );
  const uniqueContacts = new Set([
    adminContact,
    ownerContact,
    ...normalizedEmployeeContacts,
  ]);
  if (uniqueContacts.size !== employees.length + 2) {
    throw new Error(
      "Seed account contact numbers must be unique; database was not reset.",
    );
  }

  console.log("Resetting all application data...");
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE table_names text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO table_names
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations';

      IF table_names IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_names || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);

  const [passwordHash, adminPasswordHash] = await Promise.all([
    hash(PASSWORD, 12),
    hash(adminPassword, 12),
  ]);
  const adminUser = await prisma.user.create({
    data: {
      contact_number: adminContact,
      name: "Platform Admin",
      hashed_password: adminPasswordHash,
      role: Role.PLATFORM_ADMIN,
    },
  });
  const ownerUser = await prisma.user.create({
    data: {
      contact_number: ownerContact,
      name: "Ellaine Pe",
      hashed_password: passwordHash,
      role: Role.OWNER,
    },
  });
  const categories = [...new Set(services.map(([, , , category]) => category))];
  const business = await prisma.business.create({
    data: {
      name: "BeautyFeel",
      slug: "beautyfeel",
      initials: "BF",
      description: "Beauty and wellness services in Puerto Princesa.",
      latitude: 9.7410628,
      longitude: 118.7400023,
      owners: {
        create: {
          user_id: ownerUser.id,
          specialties: categories,
          is_primary: true,
        },
      },
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
      ["GENERAL", ...categories].map((category) => ({
        business_id: business.id,
        day_of_week: day,
        open_time: "10:00",
        close_time: "22:00",
        category,
      })),
    ).flat(),
  });
  await prisma.service.createMany({
    data: services.map(([name, price, duration, category]) => ({
      business_id: business.id,
      name,
      price,
      duration,
      category,
    })),
  });

  const employeeInvites: Array<{
    name: string;
    contactNumber: string;
    tempPassword: string;
    expiresAt: Date;
  }> = [];

  for (const [index, employee] of employees.entries()) {
    const contactNumber = normalizedEmployeeContacts[index];
    const tempPassword = generateTempPassword();
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS);
    const hashedPassword = await hash(tempPassword, 12);
    const user = await prisma.user.create({
      data: {
        contact_number: contactNumber,
        name: employee.name,
        hashed_password: hashedPassword,
        role: Role.EMPLOYEE,
        must_change_password: true,
        temp_password_expires_at: expiresAt,
      },
    });

    await prisma.employee.create({
      data: {
        user_id: user.id,
        business_id: business.id,
        salary: 0,
        daily_rate: 0,
        commission_percentage: 0,
        specialties: [employee.specialty.toLowerCase()],
      },
    });
    employeeInvites.push({
      name: employee.name,
      contactNumber,
      tempPassword,
      expiresAt,
    });
  }

  const smsFailures: string[] = [];
  for (const invite of employeeInvites) {
    const result = await sendEmployeeInviteSms({
      to: invite.contactNumber,
      employeeName: invite.name,
      businessName: business.name,
      tempPassword: invite.tempPassword,
      expiresAt: invite.expiresAt,
      loginUrl: EMPLOYEE_LOGIN_URL,
    });
    if (!result.success) {
      smsFailures.push(
        `${invite.name} (${invite.contactNumber}): ${result.error}`,
      );
    }
  }

  console.log("Seed complete");
  console.log(`Platform admin: ${adminUser.contact_number}`);
  console.log(`Owner: ${ownerUser.contact_number}`);
  console.log(
    `Services: ${services.length}; employees: ${employees.length}; users: ${employees.length + 2}`,
  );
  console.log(`Employee login URL: ${EMPLOYEE_LOGIN_URL}`);

  if (smsFailures.length > 0) {
    throw new Error(`Employee SMS failures:\n${smsFailures.join("\n")}`);
  }
  console.log(`Employee invite SMS sent: ${employeeInvites.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
