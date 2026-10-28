import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { Role, StaffProfile } from "@/prisma/generated/prisma/enums";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";
import { getDefaultPermissionsForProfile } from "@/lib/auth/staff-access";
import { classifyStaffSeedTarget } from "./staff-browser-seed-policy";

const businessSlug = "beautyfeel";
const accountName = "ServiceFlow QA Staff (Temporary)";
const loginContact = "09000000000";
const normalizedContact = normalizePhilippinePhone(loginContact);

async function readPasswordFromStdin() {
  if (process.stdin.isTTY) throw new Error("Pipe a generated password through stdin.");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  const strong = password.length >= 16 && Buffer.byteLength(password, "utf8") <= 72 &&
    /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  if (!strong) throw new Error("The supplied password must be strong and 16–72 UTF-8 bytes.");
  return password;
}

async function main() {
  const flags = process.argv.slice(2);
  const apply = flags.includes("--apply");
  if (flags.some((argument) => !["--apply", "--dry-run"].includes(argument)) ||
      (apply && flags.includes("--dry-run"))) {
    throw new Error("Only --dry-run and --apply are supported.");
  }
  if (process.env.NODE_ENV !== "development") throw new Error("Use the local development runtime only.");

  const { prisma } = await import("@/prisma/prisma");
  try {
    const connection = process.env.DIRECT_DATABASE_URL;
    if (!connection) throw new Error("Development direct database is unavailable.");
    const parsed = new URL(connection);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("A direct PostgreSQL connection is required.");
    const metadata = await prisma.$queryRaw<Array<{ database_name: string }>>`
      select current_database() as database_name
    `;
    const databaseName = metadata[0]?.database_name;
    if (!databaseName) throw new Error("Database identity could not be verified.");
    const provider = parsed.hostname.includes("supabase") ? "Supabase" :
      parsed.hostname.includes("neon") ? "Neon" :
      parsed.hostname.includes("railway") ? "Railway" : "Other PostgreSQL";
    const projectFromHost = /^db\.([^.]+)\.supabase\.co$/i.exec(parsed.hostname)?.[1];
    const projectFromPooler = /^postgres\.([a-z0-9-]+)$/i.exec(decodeURIComponent(parsed.username))?.[1];
    const projectRef = projectFromHost ?? projectFromPooler ?? "";
    const providerProjectFingerprint = createHash("sha256")
      .update(`${parsed.hostname}|${projectRef}|${databaseName}`)
      .digest("hex");
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true, name: true },
    });
    const collision = await prisma.user.findUnique({
      where: { contact_number: normalizedContact },
      select: { id: true },
    });
    const approval = process.env.STAFF_BROWSER_SEED_APPROVED_DATABASE &&
      process.env.STAFF_BROWSER_SEED_APPROVED_FINGERPRINT &&
      process.env.STAFF_BROWSER_SEED_APPROVED_ENVIRONMENT === "development"
      ? {
          databaseName: process.env.STAFF_BROWSER_SEED_APPROVED_DATABASE,
          providerProjectFingerprint: process.env.STAFF_BROWSER_SEED_APPROVED_FINGERPRINT,
          environment: "development" as const,
        }
      : undefined;
    const target = classifyStaffSeedTarget({ databaseName, providerProjectFingerprint }, approval);
    const preview = {
      mode: apply ? "apply" : "dry-run",
      provider,
      project: projectRef ? `${projectRef.slice(0, 4)}…${projectRef.slice(-4)}` : "host-identified",
      databaseName,
      providerProjectFingerprint,
      targetClassification: target.classification,
      business: business ? { slug: businessSlug, name: business.name } : null,
      account: { name: accountName, loginContact, profile: StaffProfile.STAFF },
      identifierAvailable: !collision,
      sideEffects: "one User and one Employee in one transaction; no messaging",
    };
    console.log(JSON.stringify(preview));
    if (!apply) return;
    if (!target.allowed || !business || collision ||
      process.env.STAFF_BROWSER_SEED_APPROVED_TENANT !== businessSlug ||
      process.env.STAFF_BROWSER_SEED_APPROVED_CONTACT !== loginContact) {
      throw new Error("Target, tenant, or account approval is missing or mismatched.");
    }

    const password = await readPasswordFromStdin();
    const hashedPassword = await hash(password, 12);
    const employeeId = await prisma.$transaction(async (tx) => {
      const currentBusiness = await tx.business.findUnique({
        where: { slug: businessSlug }, select: { id: true },
      });
      if (currentBusiness?.id !== business.id) throw new Error("Business identity changed.");
      if (await tx.user.findUnique({ where: { contact_number: normalizedContact }, select: { id: true } })) {
        throw new Error("Identifier already exists.");
      }
      const user = await tx.user.create({
        data: {
          contact_number: normalizedContact,
          hashed_password: hashedPassword,
          name: accountName,
          role: Role.EMPLOYEE,
          must_change_password: false,
          temp_password_expires_at: null,
        },
        select: { id: true },
      });
      const employee = await tx.employee.create({
        data: {
          user_id: user.id,
          business_id: business.id,
          salary: 0,
          daily_rate: 0,
          commission_percentage: 0,
          profile: StaffProfile.STAFF,
          permissions: getDefaultPermissionsForProfile(StaffProfile.STAFF),
          specialties: [],
          recurring_days_off: [],
        },
        select: { id: true },
      });
      return employee.id;
    }, { maxWait: 5_000, timeout: 10_000 });
    console.log(JSON.stringify({ created: true, employeeId, name: accountName, loginContact }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Staff test account setup stopped without printing credentials or connection details.");
  process.exitCode = 1;
});
