CREATE OR REPLACE FUNCTION payroll_capture_service() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE agreed_rate numeric;
BEGIN
  IF NEW."status" = 'COMPLETED' AND NEW."served_by_id" IS NOT NULL AND NEW."payroll_commission_rate" IS NULL THEN
    SELECT "commission_rate" INTO agreed_rate FROM "CompensationAgreement"
      WHERE "employee_id" = NEW."served_by_id" AND "effective_from" <= (NEW."completed_at" + interval '8 hours')::date
      AND ("effective_to" IS NULL OR "effective_to" >= (NEW."completed_at" + interval '8 hours')::date);
    IF agreed_rate IS NULL THEN SELECT "commission_percentage"::numeric INTO agreed_rate FROM "Employee" WHERE id = NEW."served_by_id"; END IF;
    NEW."payroll_commission_rate" := agreed_rate;
    IF EXISTS (SELECT 1 FROM "Booking" WHERE id = NEW."booking_id" AND "payment_status" = 'PAID') THEN NEW."payroll_payable_at" := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'); END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND
    (NEW.status, NEW.cancelled_at, NEW.completed_at, NEW.served_by_id, NEW.commission_base, NEW.payroll_commission_rate)
    IS DISTINCT FROM (OLD.status, OLD.cancelled_at, OLD.completed_at, OLD.served_by_id, OLD.commission_base, OLD.payroll_commission_rate)
  THEN NEW."payroll_revision" := OLD."payroll_revision" + 1; END IF;
  RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION payroll_project_commission() RETURNS trigger LANGUAGE plpgsql AS $$
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
        VALUES (gen_random_uuid()::text,tenant,existing.employee_id,existing.statement_id,CASE WHEN NEW.status = 'COMPLETED' AND NEW.cancelled_at IS NULL THEN round(NEW.commission_base::numeric * NEW.payroll_commission_rate / 100,2) - existing.amount ELSE -existing.amount END,'RECOVERY','Completed service changed after publication','Owner decision and authorization required',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,'PENDING','SOURCE_EVENT',0,existing.id,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
        ON CONFLICT ("earning_id") DO UPDATE SET amount = EXCLUDED.amount, revision = "PayrollAdjustment".revision + 1 WHERE "PayrollAdjustment".disposition IN ('PENDING','DEFERRED');
      ELSE UPDATE "PayrollEarning" SET reversed_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE id = existing.id;
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
      jsonb_build_object('serviceId',NEW.id,'bookingId',NEW.booking_id,'completedAt',NEW.completed_at,'base',NEW.commission_base::text,'rate',NEW.payroll_commission_rate::text),(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("business_id","source_type","source_id","source_revision","code") DO UPDATE SET payable_on = EXCLUDED.payable_on
      WHERE "PayrollEarning".statement_id IS NULL;
  END IF;
  RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION payroll_booking_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."payment_status",NEW."status") IS DISTINCT FROM (OLD."payment_status",OLD."status") THEN
    IF NEW."payment_status" = 'PAID' AND NEW."status" <> 'CANCELLED' THEN
      UPDATE "AvailedService" SET payroll_payable_at = COALESCE(payroll_payable_at,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) WHERE booking_id = NEW.id AND status = 'COMPLETED' AND paid_in_payslip_id IS NULL;
    ELSE
      UPDATE "AvailedService" SET payroll_payable_at = NULL WHERE booking_id = NEW.id AND paid_in_payslip_id IS NULL AND NOT EXISTS (SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='SERVICE' AND e.source_id="AvailedService".id::text AND s.status='PUBLISHED');
      UPDATE "PayrollEarning" SET payable_on = NULL WHERE source_type = 'SERVICE' AND statement_id IS NULL AND source_id IN (SELECT id::text FROM "AvailedService" WHERE booking_id = NEW.id);
      UPDATE "Employee" SET financial_revision = financial_revision + 1 WHERE id IN (SELECT served_by_id FROM "AvailedService" WHERE booking_id = NEW.id);
      IF NEW."status" = 'CANCELLED' THEN UPDATE "AvailedService" SET cancelled_at = COALESCE(cancelled_at,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) WHERE booking_id = NEW.id AND paid_in_payslip_id IS NULL; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;



ALTER TABLE "Owner" ALTER COLUMN "permissions" SET DEFAULT ARRAY['BILLING_VIEW','BILLING_MANAGE','REPORTS_VIEW_FULL','EMPLOYEES_MANAGE','STAFF_MANAGE','SETTINGS_MANAGE','CATALOG_MANAGE','PAYROLL_MANAGE','WORKFORCE_MANAGE']::"OwnerPermission"[];
CREATE UNIQUE INDEX "PayrollPaymentReconciliation_business_source_hash_key" ON "PayrollPaymentReconciliation" (business_id, source_hash);

CREATE FUNCTION payroll_confirm_attendance_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.status,NEW.time_in,NEW.time_out,NEW.is_paid_leave) IS DISTINCT FROM (OLD.status,OLD.time_in,OLD.time_out,OLD.is_paid_leave) THEN
   IF EXISTS (SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='WORKDAY' AND e.source_id=OLD.employee_id::text || ':' || to_char(OLD.date + interval '8 hours','YYYY-MM-DD') AND s.status='PUBLISHED') THEN
     RAISE EXCEPTION 'Published attendance requires a linked adjustment';
   END IF;
   NEW.revision := GREATEST(NEW.revision, OLD.revision + 1);
   IF NEW.payroll_confirmed_at IS NOT DISTINCT FROM OLD.payroll_confirmed_at THEN
     NEW.payroll_confirmed_at := NULL; NEW.payroll_confirmed_by := NULL;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_attendance_source_revision BEFORE UPDATE ON "EmployeeAttendance" FOR EACH ROW EXECUTE FUNCTION payroll_confirm_attendance_revision();

CREATE FUNCTION payroll_protect_work_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='WORKDAY' AND e.source_id=OLD.employee_id::text || ':' || to_char(OLD.work_date,'YYYY-MM-DD') AND s.status='PUBLISHED') THEN
   RAISE EXCEPTION 'Published work evidence requires a linked adjustment';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_session_evidence BEFORE UPDATE OR DELETE ON "WorkforceSession" FOR EACH ROW EXECUTE FUNCTION payroll_protect_work_evidence();
CREATE TRIGGER payroll_leave_evidence BEFORE UPDATE OR DELETE ON "LeaveAllocation" FOR EACH ROW EXECUTE FUNCTION payroll_protect_work_evidence();

CREATE FUNCTION payroll_protect_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PayrollStatement" WHERE run_id=OLD.id AND status='PUBLISHED') AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'revision')) THEN
   RAISE EXCEPTION 'Published payroll periods are immutable';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_run_evidence BEFORE UPDATE OR DELETE ON "PayrollRun" FOR EACH ROW EXECUTE FUNCTION payroll_protect_run();

CREATE FUNCTION payroll_protect_child_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PayrollStatement" WHERE id=NEW.statement_id AND status='PUBLISHED') THEN RAISE EXCEPTION 'Published payroll breakdown is fixed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_line_insert_guard BEFORE INSERT ON "PayrollStatementLine" FOR EACH ROW EXECUTE FUNCTION payroll_protect_child_insert();
CREATE TRIGGER payroll_assessment_insert_guard BEFORE INSERT ON "PayrollAssessment" FOR EACH ROW EXECUTE FUNCTION payroll_protect_child_insert();

CREATE FUNCTION payroll_protect_settlement_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Settlement evidence is immutable';
END $$;
CREATE TRIGGER payroll_allocation_evidence BEFORE UPDATE OR DELETE ON "PayrollPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION payroll_protect_settlement_evidence();
CREATE TRIGGER payroll_payment_reconciliation_evidence BEFORE UPDATE OR DELETE ON "PayrollPaymentReconciliation" FOR EACH ROW EXECUTE FUNCTION payroll_protect_settlement_evidence();

CREATE FUNCTION payroll_payment_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE statement record; settled numeric;
BEGIN
 SELECT * INTO statement FROM "PayrollStatement" WHERE id=NEW.statement_id AND business_id=NEW.business_id FOR UPDATE;
 IF statement.id IS NULL OR (statement.status<>'PUBLISHED' AND statement.legacy_payslip_id IS NULL) THEN RAISE EXCEPTION 'Publish before recording a payment'; END IF;
 SELECT COALESCE(sum(amount),0) INTO settled FROM "PayrollPayment" WHERE statement_id=NEW.statement_id;
 IF settled+NEW.amount>statement.net THEN RAISE EXCEPTION 'Payment exceeds remaining balance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_payment_balance BEFORE INSERT ON "PayrollPayment" FOR EACH ROW EXECUTE FUNCTION payroll_payment_balance_guard();

CREATE FUNCTION payroll_service_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.served_by_id IS DISTINCT FROM OLD.served_by_id AND EXISTS (SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='SERVICE' AND e.source_id=OLD.id::text AND s.status='PUBLISHED') THEN RAISE EXCEPTION 'Published commission attribution requires a linked adjustment'; END IF;
 IF (NEW.status,NEW.cancelled_at,NEW.completed_at,NEW.commission_base) IS DISTINCT FROM (OLD.status,OLD.cancelled_at,OLD.completed_at,OLD.commission_base) AND EXISTS (SELECT 1 FROM "PayrollAdjustment" a JOIN "PayrollEarning" e ON e.id=a.earning_id WHERE e.source_type='SERVICE' AND e.source_id=OLD.id::text AND a.disposition IN ('APPROVED','WAIVED')) THEN RAISE EXCEPTION 'This service already has a decided recovery; create a linked correction'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_service_assignment BEFORE UPDATE ON "AvailedService" FOR EACH ROW EXECUTE FUNCTION payroll_service_assignment_guard();

CREATE OR REPLACE FUNCTION payroll_retain_service() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='SERVICE' AND e.source_id=OLD.id::text AND s.status='PUBLISHED') THEN RAISE EXCEPTION 'Published service evidence must be archived'; END IF;
 UPDATE "PayrollEarning" SET reversed_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE source_type='SERVICE' AND source_id=OLD.id::text AND reversed_at IS NULL;
 RETURN OLD;
END $$;
