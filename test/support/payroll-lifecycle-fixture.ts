import { createHash, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { Client } from "pg";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createFixtureDatabaseClient } from "@/test/support/e2e-database";
import { testEligibility, testRules } from "@/features/payroll/v2/fixtures.test-support";

export function payrollLifecycleFixture() {
  const namespace = `e2e-payroll-lifecycle-${randomUUID()}`;
  const factory = createSharedWorkflowFactory({ namespace, now: new Date("2026-09-07T00:00:00Z") });
  const business = factory.business({ name: "Synthetic Payroll Lifecycle" });
  const suffix = String(createHash("sha256").update(namespace).digest().readUInt32BE(0) % 10_000_000).padStart(7, "0");
  const owner = factory.user({ contactNumber: `63999${suffix}` });
  const employee = factory.user({ id: `${namespace}-employee`, name: "Lifecycle Employee", role: "EMPLOYEE", contactNumber: `63998${suffix}` });
  const password = "SyntheticLifecycle123!";
  const ruleId = `SYNTHETIC-${namespace}`;
  const planId = `${namespace}-plan`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const lastTuesday = new Date(today + "T00:00:00Z");
  lastTuesday.setUTCDate(lastTuesday.getUTCDate() - (lastTuesday.getUTCDay() + 5) % 7);
  const leaveDate = lastTuesday.toISOString().slice(0, 10);
  const workStart = new Date(lastTuesday.getTime() - 86400000).toISOString().slice(0, 10);
  const local = (date: string, hour = "00:00") => new Date(`${date}T${hour}:00+08:00`).toISOString();
  let client: Client | undefined;
  let employeeId = 0;
  let leaveId = 0;
  return {
    business, owner, employee, password, workStart, leaveDate,
    get client() { if (!client) throw new Error("Payroll fixture is unavailable"); return client; },
    get employeeId() { return employeeId; },
    get leaveId() { return leaveId; },
    async seed() {
      client = createFixtureDatabaseClient(requireTestDatabase());
      await client.connect();
      await client.query("BEGIN");
      try {
        const encoded = await hash(password, 10);
        await client.query(`INSERT INTO "Business" (id,name,slug,initials,created_at,updated_at) VALUES ($1,$2,$3,$4,now(),now())`, [business.id, business.name, business.slug, business.initials]);
        for (const user of [owner, employee]) await client.query(`INSERT INTO "User" (id,name,contact_number,hashed_password,role,created_at,updated_at) VALUES ($1,$2,$3,$4,$5::"Role",now(),now())`, [user.id, user.name, user.contactNumber, encoded, user.role]);
        await client.query(`INSERT INTO "Owner" (user_id,business_id,is_primary,permissions) VALUES ($1,$2,true,ARRAY['PAYROLL_MANAGE','WORKFORCE_MANAGE','EMPLOYEES_MANAGE']::"OwnerPermission"[])`, [owner.id, business.id]);
        employeeId = (await client.query<{ id: number }>(`INSERT INTO "Employee" (user_id,business_id,salary,daily_rate,commission_percentage,employment_start) VALUES ($1,$2,0,1000,10,'2026-01-01') RETURNING id`, [employee.id, business.id])).rows[0].id;
        await client.query(`INSERT INTO "SubscriptionPlan" (id,code,name,billing_interval,price_amount,updated_at) VALUES ($1,$2,'Synthetic Payroll Plan','MONTHLY',2000,now())`, [planId, namespace.toUpperCase()]);
        await client.query(`INSERT INTO "BusinessSubscription" (id,business_id,plan_id,status,current_period_start,current_period_end,updated_at) VALUES ($1,$2,$3,'ACTIVE','2026-01-01','2100-01-01',now())`, [`${namespace}-subscription`, business.id, planId]);
        for (const weekday of [1, 2]) await client.query(`INSERT INTO "BusinessHours" (business_id,day_of_week,open_time,close_time,is_closed) VALUES ($1,$2,'09:00','17:00',false)`, [business.id, weekday]);
        await client.query(`INSERT INTO "CompensationAgreement" (id,business_id,employee_id,effective_from,basis,rate,normal_hours,commission_rate,commission_basis,created_by) VALUES ($1,$2,$3,'2026-01-01','DAILY',1000,8,10,'ORIGINAL_PRICE',$4)`, [randomUUID(), business.id, employeeId, owner.id]);
        const eligibility = { ...testEligibility, sss: false, philhealth: false, pagibig: false, withholding: false, exemptionEvidence: "Synthetic test exclusions; never use for real employees" };
        const opening = { year: Number(today.slice(0, 4)), taxable: "0", taxWithheld: "0", basicEarned: "0", thirteenthPaid: "0", benefitsReceived: "0", previousEmployer: false, confirmed: true };
        await client.query(`INSERT INTO "EmployeePayrollProfile" (employee_id,business_id,encrypted_identifiers,eligibility,eligibility_history,work_region,wage_category,monthly_basic,monthly_basic_history,ytd_opening,opening_history,opening_confirmed_at,updated_at) VALUES ($1,$2,'synthetic-envelope',$3,$4,'TEST','TEST',20000,$5,$6,$7,now(),now())`, [employeeId, business.id, JSON.stringify(eligibility), JSON.stringify([{ from: "2026-01-01", region: "TEST", category: "TEST", eligibility }]), JSON.stringify([{ from: "2026-01", basic: "20000" }]), JSON.stringify(opening), JSON.stringify({ [String(opening.year)]: opening })]);
        await client.query(`INSERT INTO "PayrollRulePackage" (id,effective_from,supported_through,rules,sources,content_hash,certified_by,certified_at,certification_evidence) VALUES ($1,'2026-01-01','2100-12-31',$2,$3,$4,'SYNTHETIC TEST ONLY',now(),'Never activate outside disposable tests')`, [ruleId, JSON.stringify(testRules), JSON.stringify(["SYNTHETIC TEST ONLY"]), createHash("sha256").update(JSON.stringify(testRules)).digest("hex")]);
        await client.query(`INSERT INTO "PayrollSettings" (business_id,mode,calculation_policy,rule_package_id,opening_confirmed_at,updated_at) VALUES ($1,'ACTIVE','GOVERNMENT',$2,now(),now())`, [business.id, ruleId]);
        await client.query(`INSERT INTO "EmployeeAttendance" (employee_id,date,status,time_in,created_at,updated_at) VALUES ($1,$2,'LATE',$3,now(),now())`, [employeeId, local(workStart), local(workStart, "09:10")]);
        leaveId = (await client.query<{ id: number }>(`INSERT INTO "LeaveRequest" (employee_id,business_id,start_date,end_date,reason,type,status,is_paid,created_at,updated_at) VALUES ($1,$2,$3,$3,'Synthetic paid discretionary leave','VACATION','PENDING',false,now(),now()) RETURNING id`, [employeeId, business.id, local(leaveDate)])).rows[0].id;
        for (let date = new Date(lastTuesday.getTime() + 86400000); date.toISOString().slice(0, 10) <= today; date = new Date(date.getTime() + 86400000)) {
          if ([1, 2].includes(date.getUTCDay())) await client.query(`INSERT INTO "EmployeeAttendance" (employee_id,date,status,created_at,updated_at) VALUES ($1,$2,'ABSENT',now(),now())`, [employeeId, local(date.toISOString().slice(0, 10))]);
        }
        const serviceId = (await client.query<{ id: number }>(`INSERT INTO "Service" (business_id,name,category,price,duration,created_at,updated_at) VALUES ($1,'Synthetic Commission Source','GENERAL',2000,30,now(),now()) RETURNING id`, [business.id])).rows[0].id;
        for (const paid of [true, false]) {
          const bookingId = (await client.query<{ id: number }>(`INSERT INTO "Booking" (business_id,status,payment_status,payment_method,amount_paid,grand_total,total_discount,is_anonymous_walk_in,customer_label,created_at,updated_at) VALUES ($1,'COMPLETED',$2::"PaymentStatus",'CASH',$3,2000,0,true,'Synthetic payroll customer',now(),now()) RETURNING id`, [business.id, paid ? "PAID" : "UNPAID", paid ? 2000 : 0])).rows[0].id;
          await client.query(`INSERT INTO "AvailedService" (booking_id,service_id,served_by_id,status,price,final_price,commission_base,completed_at,created_at,updated_at) VALUES ($1,$2,$3,'COMPLETED',2000,2000,2000,$4,now(),now())`, [bookingId, serviceId, employeeId, local(workStart, "10:00")]);
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    },
    async cleanup() {
      if (!client) return;
      requireTestDatabase();
      if (!business.id.startsWith("e2e-payroll-lifecycle-")) throw new Error("Invalid payroll fixture namespace");
      try {
        await client.query("BEGIN");
        // Bypass retention triggers only inside this disposable, namespace-scoped cleanup.
        await client.query("SET LOCAL session_replication_role = replica");
        for (const table of ["PayrollNotification", "PayrollPaymentAllocation", "PayrollPayment", "PayrollPaymentReconciliation", "PayrollStatementLine", "PayrollAssessment", "PayrollAdjustment", "PayrollEarning", "PayrollServiceChargePool", "PayrollStatement", "PayrollRun", "PayrollCommand", "PayrollSettings", "LeaveAllocation", "LeaveEntitlement", "AttendanceRevision", "AttendanceCorrectionRequest", "WorkforceSession", "EmployeePayrollProfile", "CompensationAgreement"]) await client.query(`DELETE FROM "${table}" WHERE business_id = $1`, [business.id]);
        for (const table of ["EmployeeAttendance", "Payslip", "EmployeeSchedule"]) await client.query(`DELETE FROM "${table}" WHERE employee_id = $1`, [employeeId]);
        await client.query(`DELETE FROM "AvailedService" WHERE booking_id IN (SELECT id FROM "Booking" WHERE business_id = $1)`, [business.id]);
        for (const table of ["LeaveRequest", "Booking", "Service", "Customer", "Employee", "Owner", "BusinessHours", "AuditLog", "OutboxMessage", "BusinessSubscription"]) await client.query(`DELETE FROM "${table}" WHERE business_id = $1`, [business.id]);
        await client.query(`DELETE FROM "Business" WHERE id = $1`, [business.id]);
        await client.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [[owner.id, employee.id]]);
        await client.query(`DELETE FROM "PayrollRulePackage" WHERE id = $1`, [ruleId]);
        await client.query(`DELETE FROM "SubscriptionPlan" WHERE id = $1`, [planId]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { await client.end(); client = undefined; }
    },
  };
}
