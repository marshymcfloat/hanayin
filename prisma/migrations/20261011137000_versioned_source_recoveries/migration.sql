ALTER TABLE "PayrollAdjustment" ADD COLUMN "source_revision" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "PayrollAdjustment_earning_id_key";
CREATE UNIQUE INDEX "PayrollAdjustment_earning_id_source_revision_key" ON "PayrollAdjustment" (earning_id,source_revision);

CREATE OR REPLACE FUNCTION payroll_project_commission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant text; existing record; accepted_delta numeric; desired numeric; correction numeric;
BEGIN
 SELECT business_id INTO tenant FROM "Booking" WHERE id=NEW.booking_id;
 IF NEW.served_by_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.payroll_revision<>OLD.payroll_revision OR NEW.payroll_payable_at IS DISTINCT FROM OLD.payroll_payable_at) THEN UPDATE "Employee" SET financial_revision=financial_revision+1 WHERE id=NEW.served_by_id; END IF;
 IF TG_OP='UPDATE' AND OLD.payroll_revision<>NEW.payroll_revision THEN
   FOR existing IN SELECT e.*,s.status::text AS statement_status FROM "PayrollEarning" e LEFT JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='SERVICE' AND e.source_id=NEW.id::text AND e.business_id=tenant AND e.reversed_at IS NULL LOOP
     IF existing.statement_status='PUBLISHED' THEN
       SELECT COALESCE(sum(amount),0) INTO accepted_delta FROM "PayrollAdjustment" WHERE earning_id=existing.id AND disposition='APPROVED';
       desired:=CASE WHEN NEW.status='COMPLETED' AND NEW.cancelled_at IS NULL AND EXISTS(SELECT 1 FROM "Booking" WHERE id=NEW.booking_id AND payment_status='PAID' AND amount_paid>=grand_total AND status<>'CANCELLED') THEN round(NEW.payroll_commission_base*NEW.payroll_commission_rate/100,2) ELSE 0 END;
       correction:=desired-existing.amount-accepted_delta;
       UPDATE "PayrollAdjustment" SET disposition='SUPERSEDED',revision=revision+1 WHERE earning_id=existing.id AND source_revision<NEW.payroll_revision AND disposition IN ('PENDING','DEFERRED');
       IF correction<>0 THEN
         INSERT INTO "PayrollAdjustment" (id,business_id,employee_id,original_statement_id,amount,code,reason,"authorization",effective_on,disposition,actor_id,revision,earning_id,source_revision,created_at)
         VALUES(gen_random_uuid()::text,tenant,existing.employee_id,existing.statement_id,correction,CASE WHEN correction>0 THEN 'COMMISSION_CORRECTION' ELSE 'RECOVERY' END,'Commission entitlement changed after publication','Owner review and authorization required',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,'PENDING','SOURCE_EVENT',0,existing.id,NEW.payroll_revision,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
         ON CONFLICT (earning_id,source_revision) DO NOTHING;
       END IF;
     ELSE UPDATE "PayrollEarning" SET reversed_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE id=existing.id; END IF;
   END LOOP;
 END IF;
 IF NEW.status='COMPLETED' AND NEW.cancelled_at IS NULL AND NEW.served_by_id IS NOT NULL AND NEW.completed_at IS NOT NULL AND NEW.paid_in_payslip_id IS NULL AND NEW.payroll_commission_rate IS NOT NULL AND NEW.payroll_commission_base IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.business_id=tenant AND e.source_type='SERVICE' AND e.source_id=NEW.id::text AND s.status='PUBLISHED') THEN
   INSERT INTO "PayrollEarning" (id,business_id,employee_id,source_type,source_id,source_revision,earned_on,payable_on,code,description,amount,rate,units,taxable,is_basic,snapshot,created_at)
   VALUES(gen_random_uuid()::text,tenant,NEW.served_by_id,'SERVICE',NEW.id::text,NEW.payroll_revision,(NEW.completed_at+interval '8 hours')::date,CASE WHEN NEW.payroll_payable_at IS NULL THEN NULL ELSE (NEW.payroll_payable_at+interval '8 hours')::date END,'COMMISSION','Service commission',round(NEW.payroll_commission_base*NEW.payroll_commission_rate/100,2),NEW.payroll_commission_rate,NEW.payroll_commission_base,true,false,jsonb_build_object('agreementId',NEW.payroll_agreement_id,'basisPolicy',NEW.payroll_commission_basis,'serviceId',NEW.id,'bookingId',NEW.booking_id,'completedAt',NEW.completed_at,'base',NEW.payroll_commission_base::text,'rate',NEW.payroll_commission_rate::text),(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
   ON CONFLICT (business_id,source_type,source_id,source_revision,code) DO UPDATE SET payable_on=EXCLUDED.payable_on WHERE "PayrollEarning".statement_id IS NULL;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION payroll_service_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.served_by_id IS DISTINCT FROM OLD.served_by_id AND EXISTS(SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='SERVICE' AND e.source_id=OLD.id::text AND s.status='PUBLISHED') THEN RAISE EXCEPTION 'Published commission attribution requires a linked adjustment'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION payroll_statement_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settled numeric; expected_state text;
BEGIN
 IF NEW.status='PUBLISHED' THEN
   SELECT COALESCE(sum(amount),0) INTO settled FROM "PayrollPayment" WHERE statement_id=NEW.id;
   expected_state:=CASE WHEN settled=NEW.net THEN 'PAID' WHEN settled>0 THEN 'PARTIAL' ELSE 'UNPAID' END;
   IF NEW.paid_amount<>settled OR NEW.payment_state::text<>expected_state THEN RAISE EXCEPTION 'Statement settlement must match immutable payment records'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_statement_settlement BEFORE UPDATE ON "PayrollStatement" FOR EACH ROW EXECUTE FUNCTION payroll_statement_settlement_guard();
