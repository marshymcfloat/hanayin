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
