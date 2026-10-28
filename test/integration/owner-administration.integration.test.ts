import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { replaceOwnerPermissions, switchPrimaryOwner } from "@/features/workforce/services/owner-administration";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { OwnerAdministrationOutcome } from "@/features/workforce/types/owner-administration";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failAudit: false, arrive: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/audit", async original => {
  const actual = await original<typeof import("@/lib/services/audit")>();
  return { ...actual, logAudit: async (...args: Parameters<typeof actual.logAudit>) => {
    if (controls.failAudit) throw new Error("Fixture audit failure");
    return actual.logAudit(...args);
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
                  // Real reads/writes: the barrier only forces concurrent old-state snapshots.
                  if (args.select?.permissions && controls.arrive) await controls.arrive();
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

const factory = createSharedWorkflowFactory({ namespace: `integration-owners-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const users = Array.from({ length: 4 }, (_, index) => factory.user({ id: `${business.id}-user-${index}`, contactNumber: `test-owner-${randomUUID()}` }));
const settings = [OwnerPermission.SETTINGS_MANAGE];
let context: OwnerActorContext;
let ownerIds: number[];
const primary = () => prisma.owner.findMany({ where: { business_id: business.id, is_primary: true }, select: { id: true, permissions: true } });
const audits = () => prisma.auditLog.findMany({ where: { business_id: business.id }, select: { actor_id: true, changes: true } });

async function concurrent(left: () => Promise<OwnerAdministrationOutcome>, right: () => Promise<OwnerAdministrationOutcome>) {
  let arrivals = 0;
  let release!: () => void;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    timeout = setTimeout(() => reject(new Error("Concurrent fixture requires two transaction connections")), 5000);
  });
  controls.arrive = async () => {
    if (++arrivals === 2) { clearTimeout(timeout); release(); }
    await gate;
  };
  try {
    const outcomes = await Promise.all([left(), right()]);
    expect(arrivals).toBe(2);
    expect(outcomes.filter(outcome => outcome.result.success)).toHaveLength(1);
    expect(outcomes.find(outcome => !outcome.result.success)).toEqual({ result: { success: false, error: "Owner settings changed. Refresh and try again." }, changed: false });
    expect(await audits()).toHaveLength(1);
    return outcomes;
  } finally { controls.arrive = null; clearTimeout(timeout); }
}

describe("audited owner administration in PostgreSQL", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    ownerIds = [];
    for (const [index, user] of users.entries()) {
      await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: Role.OWNER } });
      const owner = await prisma.owner.create({ data: { user_id: user.id, business_id: index === 3 ? foreign.id : business.id, permissions: settings, is_primary: index === 0 || index === 3 } });
      ownerIds.push(owner.id);
    }
    context = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: ownerIds[0], userId: users[0].id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
  });

  beforeEach(async () => {
    controls.failAudit = false;
    controls.arrive = null;
    await prisma.auditLog.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
    await prisma.user.updateMany({ where: { id: { in: users.map(user => user.id) } }, data: { role: Role.OWNER } });
    for (const [index, id] of ownerIds.entries()) await prisma.owner.update({ where: { id }, data: { permissions: settings, is_primary: index === 0 || index === 3 } });
  });

  afterAll(async () => {
    controls.failAudit = false;
    controls.arrive = null;
    try {
      await prisma.auditLog.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
      await prisma.owner.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
      await prisma.business.deleteMany({ where: { id: { in: [business.id, foreign.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    } finally { await prisma.$disconnect(); }
  });

  it("commits permissions and verified-actor audit together", async () => {
    const permissions = [OwnerPermission.REPORTS_VIEW_FULL];
    expect(await replaceOwnerPermissions(context, ownerIds[1], permissions)).toEqual({ result: { success: true }, changed: true });
    expect((await prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[1] } })).permissions).toEqual(permissions);
    expect(await audits()).toEqual([{ actor_id: users[0].id, changes: { before: { permissions: settings }, after: { permissions, mode: "OWNER_PERMISSIONS_CHANGED" } } }]);
  });

  it("does not write audits for no-op permissions or primary selection", async () => {
    expect(await replaceOwnerPermissions(context, ownerIds[1], settings)).toEqual({ result: { success: true }, changed: false });
    expect(await switchPrimaryOwner(context, ownerIds[0])).toEqual({ result: { success: true }, changed: false });
    expect(await audits()).toEqual([]);
  });

  it("does not remove primary settings or implicitly grant them on promotion", async () => {
    const restricted = [OwnerPermission.REPORTS_VIEW_FULL];
    expect((await replaceOwnerPermissions(context, ownerIds[0], restricted)).result.success).toBe(false);
    await prisma.owner.update({ where: { id: ownerIds[1] }, data: { permissions: restricted } });
    expect((await switchPrimaryOwner(context, ownerIds[1])).result.success).toBe(false);
    expect(await primary()).toEqual([{ id: ownerIds[0], permissions: settings }]);
    expect((await prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[1] } })).permissions).toEqual(restricted);
    expect(await audits()).toEqual([]);
  });

  it("rolls permission changes back when audit persistence fails", async () => {
    controls.failAudit = true;
    expect((await replaceOwnerPermissions(context, ownerIds[1], [OwnerPermission.REPORTS_VIEW_FULL])).result.success).toBe(false);
    expect((await prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[1] } })).permissions).toEqual(settings);
    expect(await audits()).toEqual([]);
  });

  it("commits a single primary and audit without changing foreign owners", async () => {
    expect(await switchPrimaryOwner(context, ownerIds[1])).toEqual({ result: { success: true }, changed: true });
    expect(await primary()).toEqual([{ id: ownerIds[1], permissions: settings }]);
    expect((await prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[3] } })).is_primary).toBe(true);
    expect(await audits()).toEqual([{ actor_id: users[0].id, changes: { before: { primaryOwnerIds: [ownerIds[0]] }, after: { primaryOwnerId: ownerIds[1], mode: "PRIMARY_OWNER_CHANGED" } } }]);
  });

  it("rolls both primary flags back when the audit fails", async () => {
    controls.failAudit = true;
    expect((await switchPrimaryOwner(context, ownerIds[1])).result.success).toBe(false);
    expect(await primary()).toEqual([{ id: ownerIds[0], permissions: settings }]);
    expect(await audits()).toEqual([]);
  });

  it.each(["permission", "role"])("denies a current actor whose %s was revoked after resolution", async revoked => {
    if (revoked === "permission") await prisma.owner.update({ where: { id: ownerIds[0] }, data: { permissions: [] } });
    else await prisma.user.update({ where: { id: users[0].id }, data: { role: Role.EMPLOYEE } });
    expect(await replaceOwnerPermissions(context, ownerIds[1], [OwnerPermission.REPORTS_VIEW_FULL])).toEqual({ result: { success: false, error: "Forbidden" }, changed: false });
    expect(await switchPrimaryOwner(context, ownerIds[1])).toEqual({ result: { success: false, error: "Forbidden" }, changed: false });
    expect((await primary()).map(owner => owner.id)).toEqual([ownerIds[0]]);
    expect((await prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[1] } })).permissions).toEqual(settings);
    expect(await audits()).toEqual([]);
  });

  it("denies foreign targets and targets whose current role is no longer owner", async () => {
    for (const id of [ownerIds[3], ownerIds[1]]) {
      if (id === ownerIds[1]) await prisma.user.update({ where: { id: users[1].id }, data: { role: Role.EMPLOYEE } });
      expect(await replaceOwnerPermissions(context, id, [OwnerPermission.REPORTS_VIEW_FULL])).toEqual({ result: { success: false, error: "Owner not found" }, changed: false });
      expect(await switchPrimaryOwner(context, id)).toEqual({ result: { success: false, error: "Owner not found" }, changed: false });
    }
    expect(await primary()).toEqual([{ id: ownerIds[0], permissions: settings }]);
    expect(await audits()).toEqual([]);
  });

  it("allows exactly one concurrent permission replacement from the same stored version", async () => {
    const choices = [[OwnerPermission.REPORTS_VIEW_FULL], [OwnerPermission.PAYROLL_MANAGE]];
    const results = await concurrent(() => replaceOwnerPermissions(context, ownerIds[1], choices[0]), () => replaceOwnerPermissions(context, ownerIds[1], choices[1]));
    expect((await prisma.owner.findUniqueOrThrow({ where: { id: ownerIds[1] } })).permissions).toEqual(choices[results.findIndex(result => result.result.success)]);
  }, 15000);

  it("allows exactly one concurrent primary switch from the same snapshot", async () => {
    const targets = [ownerIds[1], ownerIds[2]];
    const results = await concurrent(() => switchPrimaryOwner(context, targets[0]), () => switchPrimaryOwner(context, targets[1]));
    expect(await primary()).toEqual([{ id: targets[results.findIndex(result => result.result.success)], permissions: settings }]);
  }, 15000);

  it("does not promote an owner concurrently losing SETTINGS_MANAGE", async () => {
    await concurrent(() => switchPrimaryOwner(context, ownerIds[1]), () => replaceOwnerPermissions(context, ownerIds[1], [OwnerPermission.REPORTS_VIEW_FULL]));
    const current = await primary();
    expect(current).toHaveLength(1);
    expect(current[0].permissions).toContain(OwnerPermission.SETTINGS_MANAGE);
  }, 15000);
});
