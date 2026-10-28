import { createHash, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { Client } from "pg";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createFixtureDatabaseClient } from "@/test/support/e2e-database";

export function simplePayrollFixture() {
  const namespace = `e2e-payroll-simple-${randomUUID()}`;
  const workDate = "2024-01-15";
  const factory = createSharedWorkflowFactory({ namespace, now: new Date(workDate + "T01:00:00.000Z") });
  const business = factory.business({ name: "Synthetic Simple Payroll" });
  const suffix = String(createHash("sha256").update(namespace).digest().readUInt32BE(0) % 10_000_000).padStart(7, "0");
  const owner = factory.user({ name: "Simple Payroll Owner", contactNumber: `63996${suffix}` });
  const employee = factory.user({ id: `${namespace}-employee`, name: "Simple Payroll Employee", role: "EMPLOYEE", contactNumber: `63995${suffix}` });
  const password = "SyntheticSimplePayroll123!";
  const planId = `${namespace}-plan`;
  const local = (time: string) => new Date(`${workDate}T${time}:00+08:00`).toISOString();
  let client: Client | undefined;
  let employeeId = 0;

  return {
    namespace, business, owner, employee, password, workDate,
    get client() { if (!client) throw new Error("Simple payroll fixture is unavailable"); return client; },
    get employeeId() { return employeeId; },
    async seed() {
      client = createFixtureDatabaseClient(requireTestDatabase());
      await client.connect();
      await client.query("BEGIN");
      try {
        const encoded = await hash(password, 10);
        await client.query(`INSERT INTO "Business" (id,name,slug,initials,created_at,updated_at) VALUES ($1,$2,$3,$4,now(),now())`, [business.id, business.name, business.slug, business.initials]);
        for (const user of [owner, employee]) await client.query(`INSERT INTO "User" (id,name,contact_number,hashed_password,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5::"Role",now(),now())`, [user.id, user.name, user.contactNumber, encoded, user.role]);
        await client.query(`INSERT INTO "Owner" (user_id,business_id,is_primary,permissions) VALUES ($1,$2,true,ARRAY['PAYROLL_MANAGE','WORKFORCE_MANAGE','EMPLOYEES_MANAGE']::"OwnerPermission"[])`, [owner.id, business.id]);
        employeeId = (await client.query<{ id: number }>(`INSERT INTO "Employee" (user_id,business_id,salary,daily_rate,commission_percentage,employment_start) VALUES ($1,$2,0,1000,0,'2024-01-01') RETURNING id`, [employee.id, business.id])).rows[0].id;
        await client.query(`INSERT INTO "SubscriptionPlan" (id,code,name,billing_interval,price_amount,updated_at) VALUES ($1,$2,'Synthetic Simple Payroll Plan','MONTHLY',2000,now())`, [planId, namespace.toUpperCase()]);
        await client.query(`INSERT INTO "BusinessSubscription" (id,business_id,plan_id,status,current_period_start,current_period_end,updated_at) VALUES ($1,$2,$3,'ACTIVE','2024-01-01','2100-01-01',now())`, [`${namespace}-subscription`, business.id, planId]);
        await client.query(`INSERT INTO "BusinessHours" (business_id,day_of_week,open_time,close_time,is_closed) VALUES ($1,1,'09:00','17:00',false)`, [business.id]);
        await client.query(`INSERT INTO "CompensationAgreement" (id,business_id,employee_id,effective_from,basis,rate,normal_hours,commission_rate,commission_basis,created_by) VALUES ($1,$2,$3,'2024-01-01','DAILY',1000,8,0,'ORIGINAL_PRICE',$4)`, [randomUUID(), business.id, employeeId, owner.id]);
        await client.query(`INSERT INTO "PayrollSettings" (business_id,mode,calculation_policy,simple_effective_from,opening_confirmed_at,reconciliation,updated_at) VALUES ($1,'ACTIVE','SIMPLE',$2,now(),$3,now())`, [business.id, workDate, JSON.stringify({ legacyCount: 0, migrated: 0, unresolved: 0 })]);
        await client.query(`INSERT INTO "EmployeeAttendance" (employee_id,date,status,time_in,time_out,payroll_confirmed_at,payroll_confirmed_by,created_at,updated_at) VALUES ($1,$2,'PRESENT',$3,$4,now(),$5,now(),now())`, [employeeId, local("00:00"), local("09:00"), local("17:00"), owner.id]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    },
    async cleanup() {
      if (!client) return;
      requireTestDatabase();
      if (!business.id.startsWith("e2e-payroll-simple-")) throw new Error("Invalid simple payroll fixture namespace");
      try {
        await client.query("BEGIN");
        // Retained synthetic evidence is removed only within the guarded fixture cleanup.
        await client.query("SET LOCAL session_replication_role = replica");
        for (const table of ["PayrollNotification", "PayrollPaymentAllocation", "PayrollPayment", "PayrollPaymentReconciliation", "PayrollStatementLine", "PayrollAssessment", "PayrollAdjustment", "PayrollEarning", "PayrollServiceChargePool", "PayrollStatement", "PayrollRun", "PayrollCommand", "PayrollSettings", "LeaveAllocation", "LeaveEntitlement", "AttendanceRevision", "AttendanceCorrectionRequest", "WorkforceSession", "EmployeePayrollProfile", "CompensationAgreement"]) await client.query(`DELETE FROM "${table}" WHERE business_id = $1`, [business.id]);
        if (employeeId) for (const table of ["EmployeeAttendance", "Payslip", "EmployeeSchedule"]) await client.query(`DELETE FROM "${table}" WHERE employee_id = $1`, [employeeId]);
        for (const table of ["LeaveRequest", "Booking", "Service", "Customer", "Employee", "Owner", "BusinessHours", "AuditLog", "OutboxMessage", "BusinessSubscription"]) await client.query(`DELETE FROM "${table}" WHERE business_id = $1`, [business.id]);
        await client.query(`DELETE FROM "Business" WHERE id = $1`, [business.id]);
        await client.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [[owner.id, employee.id]]);
        await client.query(`DELETE FROM "SubscriptionPlan" WHERE id = $1`, [planId]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { await client.end(); client = undefined; }
    },
  };
}
