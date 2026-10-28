import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { replaceOwnerSpecialties } from "@/features/workforce/services/owner-specialties";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failAudit: false, auditReached: false, arrive: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/audit", async original => {
  const actual = await original<typeof import("@/lib/services/audit")>();
  return { ...actual, logAudit: async (...args: Parameters<typeof actual.logAudit>) => {
    const result = await actual.logAudit(...args);
    if (controls.failAudit) { controls.auditReached = true; throw new Error("Fixture post-insert failure"); }
    return result;
  } };
});
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            if (member !== "owner") return Reflect.get(transaction, member);
            return new Proxy(transaction.owner, {
              get(owner, operation) {
                if (operation === "findFirst") return async (args: Prisma.OwnerFindFirstArgs) => {
                  const result = await owner.findFirst(args);
                  if (args.select?.specialties && controls.arrive) await controls.arrive();
                  return result;
                };
                const value = Reflect.get(owner, operation);
                return typeof value === "function" ? value.bind(owner) : value;
              },
            });
          },
        })), options);
      const value = Reflect.get(client, key);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const factory = createSharedWorkflowFactory({ namespace: "integration-owner-specialties" });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const users = Array.from({ length: 3 }, (_, index) => factory.user({ id: `${business.id}-user-${index}`, contactNumber: `test-owner-specialties-${index}` }));
const businessIds = [business.id, foreign.id];
const settings = [OwnerPermission.SETTINGS_MANAGE];
let ownerIds: number[] = [];
let context: OwnerActorContext;
const target = () => prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[1] }, select: { specialties: true } });
const audits = () => prisma.auditLog.findMany({ where: { business_id: { in: businessIds } }, select: { actor_id: true, changes: true } });

async function cleanup() {
  try { await prisma.auditLog.deleteMany({ where: { business_id: { in: businessIds } } }); }
  finally {
    try { await prisma.business.deleteMany({ where: { id: { in: businessIds } } }); }
    finally { await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); }
  }
}

describe("owner-specialty transactions in isolated PostgreSQL", () => {
  beforeAll(async () => {
    await cleanup();
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    ownerIds = [];
    for (const [index, user] of users.entries()) {
      await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: Role.OWNER } });
      const owner = await prisma.owner.create({ data: { user_id: user.id, business_id: index === 2 ? foreign.id : business.id, permissions: settings, specialties: ["GENERAL"] } });
      ownerIds.push(owner.id);
    }
    context = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: ownerIds[0], userId: users[0].id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
  });
  beforeEach(async () => {
    controls.failAudit = false; controls.auditReached = false; controls.arrive = null;
    await prisma.auditLog.deleteMany({ where: { business_id: { in: businessIds } } });
    await prisma.user.updateMany({ where: { id: { in: users.map(user => user.id) } }, data: { role: Role.OWNER } });
    for (const [index, id] of ownerIds.entries()) await prisma.owner.update({ where: { id }, data: { business_id: index === 2 ? foreign.id : business.id, permissions: settings, specialties: ["GENERAL"] } });
  });
  afterAll(async () => {
    controls.failAudit = false; controls.arrive = null;
    try { await cleanup(); } finally { await prisma.$disconnect(); }
  });

  it("commits raw specialty replacement and verified audit together", async () => {
    const specialties = [" SPA ", "NAILS", "NAILS"];
    expect(await replaceOwnerSpecialties(context, ownerIds[1], specialties)).toEqual({ result: { success: true }, changed: true });
    expect(await target()).toEqual({ specialties });
    expect(await audits()).toEqual([{ actor_id: users[0].id, changes: { before: { specialties: ["GENERAL"] }, after: { specialties, mode: "OWNER_SPECIALTIES_UPDATED" } } }]);
  });
  it("leaves no-op state unchanged without an audit", async () => {
    expect(await replaceOwnerSpecialties(context, ownerIds[1], ["GENERAL"])).toEqual({ result: { success: true }, changed: false }); expect(await audits()).toEqual([]);
  });
  it("rolls both real specialty update and inserted audit back on post-insert failure", async () => {
    controls.failAudit = true;
    expect((await replaceOwnerSpecialties(context, ownerIds[1], ["SPA"])).result.success).toBe(false);
    expect(controls.auditReached).toBe(true); expect(await target()).toEqual({ specialties: ["GENERAL"] }); expect(await audits()).toEqual([]);
  });
  it.each(["permission", "role", "membership"])("denies actor %s revoked after context resolution", async revoked => {
    if (revoked === "permission") await prisma.owner.update({ where: { id: ownerIds[0] }, data: { permissions: [] } });
    else if (revoked === "role") await prisma.user.update({ where: { id: users[0].id }, data: { role: Role.EMPLOYEE } });
    else await prisma.owner.update({ where: { id: ownerIds[0] }, data: { business_id: foreign.id } });
    expect(await replaceOwnerSpecialties(context, ownerIds[1], ["SPA"])).toEqual({ result: { success: false, error: "Forbidden" }, changed: false });
    expect(await target()).toEqual({ specialties: ["GENERAL"] }); expect(await audits()).toEqual([]);
  });
  it.each(["foreign", "role"])("denies target %s without state or audit changes", async invalid => {
    if (invalid === "role") await prisma.user.update({ where: { id: users[1].id }, data: { role: Role.EMPLOYEE } });
    expect(await replaceOwnerSpecialties(context, invalid === "foreign" ? ownerIds[2] : ownerIds[1], ["SPA"])).toEqual({ result: { success: false, error: "Owner not found" }, changed: false });
    expect(await target()).toEqual({ specialties: ["GENERAL"] }); expect(await audits()).toEqual([]);
  });
  it("allows clearing specialties without changing foreign owners", async () => {
    expect((await replaceOwnerSpecialties(context, ownerIds[1], [])).result.success).toBe(true); expect(await target()).toEqual({ specialties: [] });
    expect((await prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[2] } })).specialties).toEqual(["GENERAL"]); expect(await audits()).toHaveLength(1);
  });
  it("allows one concurrent replacement from the same real stored snapshot", async () => {
    let arrivals = 0;
    let release!: () => void;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const gate = new Promise<void>((resolve, reject) => { release = resolve; timeout = setTimeout(() => reject(new Error("Fixture needs two transaction connections")), 5000); });
    controls.arrive = async () => { if (++arrivals === 2) { clearTimeout(timeout); release(); } await gate; };
    const choices = [["SPA"], ["NAILS"]];
    try {
      const outcomes = await Promise.all(choices.map(specialties => replaceOwnerSpecialties(context, ownerIds[1], specialties)));
      expect(arrivals).toBe(2); expect(outcomes.filter(outcome => outcome.result.success)).toHaveLength(1);
      expect(outcomes.find(outcome => !outcome.result.success)).toEqual({ result: { success: false, error: "Owner settings changed. Refresh and try again." }, changed: false });
      expect(await target()).toEqual({ specialties: choices[outcomes.findIndex(outcome => outcome.result.success)] }); expect(await audits()).toHaveLength(1);
    } finally { controls.arrive = null; clearTimeout(timeout); }
  }, 15000);
});
