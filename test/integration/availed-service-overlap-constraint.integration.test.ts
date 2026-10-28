/**
 * Real-Postgres integration test for the EXCLUDE constraint that
 * prevents two AvailedService rows from overlapping in time for the
 * same employee or owner. The constraint is the storage-layer fix
 * for the booking double-book race; this test verifies it actually
 * fires under direct INSERT load (which unit-test mocks can't cover).
 *
 * Requires explicit disposable TEST_DATABASE_URL configuration. CI runs
 * against the postgres:16 service in `.github/workflows/ci.yml`
 * (job: `quality`). Lives under test/integration/ rather than alongside
 * the unit tests so it doesn't run on `vitest watch` by accident.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { Client } from "pg";
import { requireTestDatabase } from "../../scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "../factories/shared-workflows";

const dbConnectionString = requireTestDatabase();

let client: Client | null = null;
let businessId = "";
let userId = "";
let employeeId = 0;
let serviceId = 0;
let bookingId = 0;
const seed = createSharedWorkflowFactory({
  namespace: "integration-availed-service-overlap",
}).sharedWorkflowSeed();

const isoOffset = (date: Date) => date.toISOString().replace("Z", "+00:00");

describe(
  "AvailedService EXCLUDE constraint (integration)",
  () => {
    beforeAll(async () => {
      client = new Client({
        connectionString: dbConnectionString!,
        connectionTimeoutMillis: 4000,
      });
      await client.connect();

      // Sanity check — fail fast if the migration hasn't been applied.
      const constraintCheck = await client.query(
        `SELECT conname FROM pg_constraint
         WHERE conname IN (
           'AvailedService_employee_no_overlap_excl',
           'AvailedService_owner_no_overlap_excl'
         )`,
      );
      if (constraintCheck.rowCount !== 2) {
        throw new Error(
          "EXCLUDE constraints not present — run `prisma migrate deploy` first.",
        );
      }
    });

    afterAll(async () => {
      if (client) {
        await client.query(`DELETE FROM "Business" WHERE id = $1`, [businessId]);
        await client.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
      }
      await client?.end().catch(() => {});
    });

    beforeEach(async () => {
      if (!client) throw new Error("DB client not connected");
      // Fixed factory records plus cleanup make reruns reproducible and
      // recover safely from a prior interrupted run.
      businessId = seed.business.id;
      userId = seed.employee.id;

      // Cleanup any prior leftovers from a crashed run.
      await client.query(`DELETE FROM "Business" WHERE id = $1`, [businessId]);
      await client.query(`DELETE FROM "User" WHERE id = $1`, [userId]);

      await client.query(
        `INSERT INTO "User" (id, name, hashed_password, role, contact_number, updated_at)
         VALUES ($1, 'Excl Test User', 'x', 'EMPLOYEE', $2, NOW())`,
        [userId, seed.employee.contactNumber],
      );
      await client.query(
        `INSERT INTO "Business" (id, name, slug, initials, updated_at)
         VALUES ($1, 'Excl Test', $2, 'EX', NOW())`,
        [businessId, seed.business.slug],
      );
      const empResult = await client.query(
        `INSERT INTO "Employee" (user_id, salary, business_id)
         VALUES ($1, 0, $2) RETURNING id`,
        [userId, businessId],
      );
      employeeId = empResult.rows[0].id;
      const svcResult = await client.query(
        `INSERT INTO "Service" (name, price, category, business_id, updated_at)
         VALUES ('Test Service', 100, 'GENERAL', $1, NOW()) RETURNING id`,
        [businessId],
      );
      serviceId = svcResult.rows[0].id;
      const bkResult = await client.query(
        `INSERT INTO "Booking" (
            business_id, status, scheduled_at, estimated_end,
            grand_total, total_discount, amount_paid,
            payment_status, payment_method, updated_at
         ) VALUES ($1, 'ACCEPTED',
            '2026-06-01T09:00:00+00:00', '2026-06-01T11:00:00+00:00',
            100, 0, 0, 'UNPAID', 'CASH', NOW())
         RETURNING id`,
        [businessId],
      );
      bookingId = bkResult.rows[0].id;
    });

    async function insertAvailedService(
      start: Date,
      end: Date,
      status = "PENDING",
    ) {
      return client!.query(
        `INSERT INTO "AvailedService" (
            price, estimated_cost, discount, final_price, commission_base,
            status, booking_id, service_id, served_by_id,
            scheduled_at, estimated_end, updated_at
         ) VALUES (
            100, 50, 0, 100, 100,
            $1::"AvailedServiceStatus", $2, $3, $4,
            $5, $6, NOW())
         RETURNING id`,
        [status, bookingId, serviceId, employeeId, isoOffset(start), isoOffset(end)],
      );
    }

    it("rejects overlapping rows for the same employee with sqlstate 23P01", async () => {
      const startA = new Date("2026-06-01T09:00:00Z");
      const endA = new Date("2026-06-01T10:00:00Z");
      // 9:30-10:30 overlaps the 9:00-10:00 window on the right.
      const startB = new Date("2026-06-01T09:30:00Z");
      const endB = new Date("2026-06-01T10:30:00Z");

      await insertAvailedService(startA, endA);
      await expect(insertAvailedService(startB, endB)).rejects.toMatchObject({
        code: "23P01",
        constraint: expect.stringContaining(
          "AvailedService_employee_no_overlap_excl",
        ),
      });
    });

    it("allows back-to-back rows (half-open ranges, '[)' semantics)", async () => {
      // 9-10 and 10-11 share only the 10:00 boundary. Half-open means
      // they don't conflict — important for chained appointments.
      const startA = new Date("2026-06-01T09:00:00Z");
      const endA = new Date("2026-06-01T10:00:00Z");
      const startB = new Date("2026-06-01T10:00:00Z");
      const endB = new Date("2026-06-01T11:00:00Z");

      await insertAvailedService(startA, endA);
      // Should NOT throw — 10:00 is the upper bound of A and the lower
      // bound of B, but the range is [start, end) so no overlap.
      const result = await insertAvailedService(startB, endB);
      expect(result.rowCount).toBe(1);
    });

    it("does not constrain CANCELLED rows (partial-index WHERE excludes them)", async () => {
      const startA = new Date("2026-06-01T09:00:00Z");
      const endA = new Date("2026-06-01T10:00:00Z");
      const startB = new Date("2026-06-01T09:30:00Z");
      const endB = new Date("2026-06-01T10:30:00Z");

      // Cancel the first row by status BEFORE inserting the second —
      // proves the WHERE clause excludes cancelled rows from the
      // overlap index, so a new booking can take their slot.
      await insertAvailedService(startA, endA, "CANCELLED");
      const result = await insertAvailedService(startB, endB);
      expect(result.rowCount).toBe(1);
    });

    it("does not constrain rows with NULL served_by_id", async () => {
      // Unassigned bookings (any-available staff) skip the constraint.
      // Capacity math at the application layer handles this case.
      const startA = new Date("2026-06-01T09:00:00Z");
      const endA = new Date("2026-06-01T10:00:00Z");
      const startB = new Date("2026-06-01T09:30:00Z");
      const endB = new Date("2026-06-01T10:30:00Z");

      await client!.query(
        `INSERT INTO "AvailedService" (
            price, estimated_cost, discount, final_price, commission_base,
            status, booking_id, service_id, served_by_id,
            scheduled_at, estimated_end, updated_at
         ) VALUES (
            100, 50, 0, 100, 100,
            'PENDING', $1, $2, NULL, $3, $4, NOW())`,
        [bookingId, serviceId, isoOffset(startA), isoOffset(endA)],
      );
      const result = await client!.query(
        `INSERT INTO "AvailedService" (
            price, estimated_cost, discount, final_price, commission_base,
            status, booking_id, service_id, served_by_id,
            scheduled_at, estimated_end, updated_at
         ) VALUES (
            100, 50, 0, 100, 100,
            'PENDING', $1, $2, NULL, $3, $4, NOW())
         RETURNING id`,
        [bookingId, serviceId, isoOffset(startB), isoOffset(endB)],
      );
      expect(result.rowCount).toBe(1);
    });
  },
);
