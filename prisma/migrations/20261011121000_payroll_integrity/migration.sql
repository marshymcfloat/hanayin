CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "CompensationAgreement" ADD CONSTRAINT "compensation_no_overlap"
  EXCLUDE USING gist ("employee_id" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&);
ALTER TABLE "CompensationAgreement" ADD CONSTRAINT "compensation_values"
  CHECK ("rate" >= 0 AND "normal_hours" > 0 AND "normal_hours" <= 8 AND "commission_rate" BETWEEN 0 AND 100 AND ("effective_to" IS NULL OR "effective_to" >= "effective_from"));
ALTER TABLE "PayrollRun" ADD CONSTRAINT "payroll_period_dates" CHECK ("start_date" <= "end_date" AND "payment_date" >= "end_date");
ALTER TABLE "PayrollStatement" ADD CONSTRAINT "payroll_statement_balance"
  CHECK ("paid_amount" >= 0 AND "paid_amount" <= "net" AND "net" >= 0 AND "gross" - "deductions" = "net");
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "payroll_positive_payment" CHECK ("amount" > 0);
ALTER TABLE "WorkforceSession" ADD CONSTRAINT "work_session_order" CHECK ("ended_at" IS NULL OR "ended_at" > "started_at");
ALTER TABLE "WorkforceSession" ADD CONSTRAINT "work_session_no_overlap"
  EXCLUDE USING gist ("employee_id" WITH =, tsrange("started_at", COALESCE("ended_at", 'infinity'::timestamp), '[)') WITH &&);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "leave_request_no_overlap"
  EXCLUDE USING gist ("employee_id" WITH =, tsrange("start_date", "end_date" + interval '1 day', '[)') WITH &&)
  WHERE ("status" IN ('PENDING','APPROVED') AND "cancelled_at" IS NULL);

UPDATE "Owner" SET "permissions" = array_append("permissions", 'WORKFORCE_MANAGE'::"OwnerPermission")
  WHERE 'EMPLOYEES_MANAGE'::"OwnerPermission" = ANY("permissions");

CREATE FUNCTION payroll_protect_statement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" = 'PUBLISHED' THEN RAISE EXCEPTION 'Published statements cannot be deleted'; END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'PUBLISHED' AND
    (to_jsonb(NEW) - ARRAY['paid_amount','payment_state','revision']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['paid_amount','payment_state','revision'])
  THEN RAISE EXCEPTION 'Published statements require a linked adjustment'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_statement_immutable BEFORE UPDATE OR DELETE ON "PayrollStatement"
  FOR EACH ROW EXECUTE FUNCTION payroll_protect_statement();

CREATE FUNCTION payroll_protect_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
  SELECT "status"::text INTO state FROM "PayrollStatement" WHERE "id" = OLD."statement_id";
  IF state = 'PUBLISHED' THEN RAISE EXCEPTION 'Published payroll evidence is immutable'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_line_immutable BEFORE UPDATE OR DELETE ON "PayrollStatementLine" FOR EACH ROW EXECUTE FUNCTION payroll_protect_child();
CREATE TRIGGER payroll_assessment_immutable BEFORE UPDATE OR DELETE ON "PayrollAssessment" FOR EACH ROW EXECUTE FUNCTION payroll_protect_child();
CREATE TRIGGER payroll_payment_immutable BEFORE UPDATE OR DELETE ON "PayrollPayment" FOR EACH ROW EXECUTE FUNCTION payroll_protect_child();

CREATE FUNCTION payroll_protect_legacy_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."paid_in_payslip_id" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Paid work evidence cannot be deleted'; END IF;
    IF (to_jsonb(NEW) - ARRAY['updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at'])
      THEN RAISE EXCEPTION 'Paid work requires an adjustment'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_legacy_attendance_lock BEFORE UPDATE OR DELETE ON "EmployeeAttendance" FOR EACH ROW EXECUTE FUNCTION payroll_protect_legacy_source();
CREATE TRIGGER payroll_legacy_service_lock BEFORE UPDATE OR DELETE ON "AvailedService" FOR EACH ROW EXECUTE FUNCTION payroll_protect_legacy_source();

CREATE FUNCTION payroll_capture_service() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE agreed_rate numeric;
BEGIN
  IF NEW."status" = 'COMPLETED' AND NEW."served_by_id" IS NOT NULL AND NEW."payroll_commission_rate" IS NULL THEN
    SELECT "commission_rate" INTO agreed_rate FROM "CompensationAgreement"
      WHERE "employee_id" = NEW."served_by_id" AND "effective_from" <= (NEW."completed_at" + interval '8 hours')::date
      AND ("effective_to" IS NULL OR "effective_to" >= (NEW."completed_at" + interval '8 hours')::date);
    IF agreed_rate IS NULL THEN SELECT "commission_percentage"::numeric INTO agreed_rate FROM "Employee" WHERE id = NEW."served_by_id"; END IF;
    NEW."payroll_commission_rate" := agreed_rate;
    IF EXISTS (SELECT 1 FROM "Booking" WHERE id = NEW."booking_id" AND "payment_status" = 'PAID') THEN NEW."payroll_payable_at" := CURRENT_TIMESTAMP; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND
    (NEW.status, NEW.cancelled_at, NEW.completed_at, NEW.served_by_id, NEW.commission_base, NEW.payroll_commission_rate)
    IS DISTINCT FROM (OLD.status, OLD.cancelled_at, OLD.completed_at, OLD.served_by_id, OLD.commission_base, OLD.payroll_commission_rate)
  THEN NEW."payroll_revision" := OLD."payroll_revision" + 1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payroll_service_capture BEFORE INSERT OR UPDATE ON "AvailedService" FOR EACH ROW EXECUTE FUNCTION payroll_capture_service();

CREATE FUNCTION payroll_project_commission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant text; existing record;
BEGIN
  SELECT "business_id" INTO tenant FROM "Booking" WHERE id = NEW."booking_id";
  IF NEW."served_by_id" IS NOT NULL THEN UPDATE "Employee" SET "financial_revision" = "financial_revision" + 1 WHERE id = NEW."served_by_id"; END IF;
  IF TG_OP = 'UPDATE' AND OLD."payroll_revision" <> NEW."payroll_revision" THEN
    FOR existing IN SELECT e.*, s.status::text AS statement_status FROM "PayrollEarning" e LEFT JOIN "PayrollStatement" s ON s.id = e.statement_id
      WHERE e.source_type = 'SERVICE' AND e.source_id = NEW.id::text AND e.business_id = tenant AND e.reversed_at IS NULL
    LOOP
      IF existing.statement_status = 'PUBLISHED' THEN
        INSERT INTO "PayrollAdjustment" ("id","business_id","employee_id","original_statement_id","amount","code","reason","authorization","effective_on","disposition","actor_id","revision","earning_id","created_at")
        VALUES (gen_random_uuid()::text,tenant,existing.employee_id,existing.statement_id,-existing.amount,'RECOVERY','Completed service changed after publication','Owner decision and authorization required',(CURRENT_TIMESTAMP + interval '8 hours')::date,'PENDING','SOURCE_EVENT',0,existing.id,CURRENT_TIMESTAMP)
        ON CONFLICT ("earning_id") DO NOTHING;
      ELSE UPDATE "PayrollEarning" SET reversed_at = CURRENT_TIMESTAMP WHERE id = existing.id;
      END IF;
    END LOOP;
  END IF;
  IF NEW."status" = 'COMPLETED' AND NEW."cancelled_at" IS NULL AND NEW."served_by_id" IS NOT NULL AND NEW."completed_at" IS NOT NULL AND NEW."paid_in_payslip_id" IS NULL AND NEW."payroll_commission_rate" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id = e.statement_id WHERE e.business_id = tenant AND e.source_type = 'SERVICE' AND e.source_id = NEW.id::text AND s.status = 'PUBLISHED')
  THEN
    INSERT INTO "PayrollEarning" ("id","business_id","employee_id","source_type","source_id","source_revision","earned_on","payable_on","code","description","amount","rate","units","taxable","is_basic","snapshot","created_at")
    VALUES (gen_random_uuid()::text,tenant,NEW.served_by_id,'SERVICE',NEW.id::text,NEW.payroll_revision,(NEW.completed_at + interval '8 hours')::date,
      CASE WHEN NEW.payroll_payable_at IS NULL THEN NULL ELSE (NEW.payroll_payable_at + interval '8 hours')::date END,
      'COMMISSION','Service commission',round(NEW.commission_base::numeric * NEW.payroll_commission_rate / 100,2),NEW.payroll_commission_rate,NEW.commission_base::numeric,true,false,
      jsonb_build_object('serviceId',NEW.id,'bookingId',NEW.booking_id,'completedAt',NEW.completed_at,'base',NEW.commission_base::text,'rate',NEW.payroll_commission_rate::text),CURRENT_TIMESTAMP)
    ON CONFLICT ("business_id","source_type","source_id","source_revision","code") DO UPDATE SET payable_on = EXCLUDED.payable_on
      WHERE "PayrollEarning".statement_id IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payroll_commission_projection AFTER INSERT OR UPDATE ON "AvailedService" FOR EACH ROW EXECUTE FUNCTION payroll_project_commission();

CREATE FUNCTION payroll_booking_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."payment_status",NEW."status") IS DISTINCT FROM (OLD."payment_status",OLD."status") THEN
    IF NEW."payment_status" = 'PAID' AND NEW."status" <> 'CANCELLED' THEN
      UPDATE "AvailedService" SET payroll_payable_at = COALESCE(payroll_payable_at,CURRENT_TIMESTAMP) WHERE booking_id = NEW.id AND status = 'COMPLETED' AND paid_in_payslip_id IS NULL;
    ELSE
      UPDATE "PayrollEarning" SET payable_on = NULL WHERE source_type = 'SERVICE' AND statement_id IS NULL AND source_id IN (SELECT id::text FROM "AvailedService" WHERE booking_id = NEW.id);
      UPDATE "Employee" SET financial_revision = financial_revision + 1 WHERE id IN (SELECT served_by_id FROM "AvailedService" WHERE booking_id = NEW.id);
      IF NEW."status" = 'CANCELLED' THEN UPDATE "AvailedService" SET cancelled_at = COALESCE(cancelled_at,CURRENT_TIMESTAMP) WHERE booking_id = NEW.id AND paid_in_payslip_id IS NULL; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payroll_booking_payment_projection AFTER UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION payroll_booking_payment();

CREATE FUNCTION payroll_bump_employee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Employee" SET financial_revision = financial_revision + 1 WHERE id = COALESCE(NEW.employee_id,OLD.employee_id);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_attendance_revision AFTER INSERT OR UPDATE OR DELETE ON "EmployeeAttendance" FOR EACH ROW EXECUTE FUNCTION payroll_bump_employee();
CREATE TRIGGER payroll_compensation_revision AFTER INSERT OR UPDATE OR DELETE ON "CompensationAgreement" FOR EACH ROW EXECUTE FUNCTION payroll_bump_employee();
CREATE TRIGGER payroll_profile_revision AFTER INSERT OR UPDATE OR DELETE ON "EmployeePayrollProfile" FOR EACH ROW EXECUTE FUNCTION payroll_bump_employee();
CREATE TRIGGER payroll_session_revision AFTER INSERT OR UPDATE OR DELETE ON "WorkforceSession" FOR EACH ROW EXECUTE FUNCTION payroll_bump_employee();
CREATE TRIGGER payroll_leave_revision AFTER INSERT OR UPDATE OR DELETE ON "LeaveAllocation" FOR EACH ROW EXECUTE FUNCTION payroll_bump_employee();
CREATE TRIGGER payroll_schedule_revision AFTER INSERT OR UPDATE OR DELETE ON "EmployeeSchedule" FOR EACH ROW EXECUTE FUNCTION payroll_bump_employee();
