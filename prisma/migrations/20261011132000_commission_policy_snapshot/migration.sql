ALTER TABLE "AvailedService" ADD COLUMN "payroll_commission_base" DECIMAL(18,6), ADD COLUMN "payroll_commission_basis" TEXT, ADD COLUMN "payroll_agreement_id" TEXT;
CREATE OR REPLACE FUNCTION payroll_capture_service() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE agreement record;
BEGIN
 IF NEW.status='COMPLETED' AND NEW.served_by_id IS NOT NULL AND NEW.completed_at IS NOT NULL AND NEW.payroll_commission_base IS NULL THEN
   SELECT id,commission_rate,commission_basis INTO agreement FROM "CompensationAgreement" WHERE employee_id=NEW.served_by_id AND effective_from<=(NEW.completed_at+interval '8 hours')::date AND (effective_to IS NULL OR effective_to>=(NEW.completed_at+interval '8 hours')::date);
   IF agreement.id IS NOT NULL THEN
     NEW.payroll_commission_rate:=COALESCE(NEW.payroll_commission_rate,agreement.commission_rate);
     NEW.payroll_commission_basis:=agreement.commission_basis; NEW.payroll_agreement_id:=agreement.id;
     NEW.payroll_commission_base:=CASE WHEN NEW.commission_base=0 THEN 0 WHEN agreement.commission_basis='ORIGINAL_PRICE' THEN NEW.price::numeric ELSE NEW.final_price::numeric END;
   ELSE
     SELECT commission_percentage::numeric INTO NEW.payroll_commission_rate FROM "Employee" WHERE id=NEW.served_by_id;
     NEW.payroll_commission_basis:='CAPTURED_BOOKING_BASE'; NEW.payroll_commission_base:=NEW.commission_base::numeric;
   END IF;
   IF EXISTS(SELECT 1 FROM "Booking" WHERE id=NEW.booking_id AND payment_status='PAID' AND status<>'CANCELLED') THEN NEW.payroll_payable_at:=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'); END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.commission_base IS DISTINCT FROM OLD.commission_base THEN NEW.payroll_commission_base:=NEW.commission_base::numeric;
   ELSIF OLD.payroll_commission_base IS NOT NULL AND OLD.payroll_commission_base<>0 THEN
     IF NEW.payroll_commission_basis='ORIGINAL_PRICE' AND NEW.price IS DISTINCT FROM OLD.price THEN NEW.payroll_commission_base:=NEW.price::numeric;
     ELSIF NEW.payroll_commission_basis='DISCOUNTED_PRICE' AND NEW.final_price IS DISTINCT FROM OLD.final_price THEN NEW.payroll_commission_base:=NEW.final_price::numeric; END IF;
   END IF;
   IF (NEW.status,NEW.cancelled_at,NEW.completed_at,NEW.served_by_id,NEW.payroll_commission_base,NEW.payroll_commission_rate) IS DISTINCT FROM (OLD.status,OLD.cancelled_at,OLD.completed_at,OLD.served_by_id,OLD.payroll_commission_base,OLD.payroll_commission_rate) THEN NEW.payroll_revision:=OLD.payroll_revision+1; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION payroll_protect_compensation_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PayrollEarning" WHERE snapshot->>'agreementId'=OLD.id) THEN
   IF TG_OP='DELETE' OR (NEW.rate,NEW.basis,NEW.normal_hours,NEW.monthly_divisor,NEW.commission_rate,NEW.commission_basis,NEW.effective_from,NEW.employee_id,NEW.business_id) IS DISTINCT FROM (OLD.rate,OLD.basis,OLD.normal_hours,OLD.monthly_divisor,OLD.commission_rate,OLD.commission_basis,OLD.effective_from,OLD.employee_id,OLD.business_id) THEN RAISE EXCEPTION 'Captured compensation requires a new effective agreement'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_compensation_evidence BEFORE UPDATE OR DELETE ON "CompensationAgreement" FOR EACH ROW EXECUTE FUNCTION payroll_protect_compensation_evidence();
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
        VALUES (gen_random_uuid()::text,tenant,existing.employee_id,existing.statement_id,CASE WHEN NEW.status = 'COMPLETED' AND NEW.cancelled_at IS NULL THEN round(NEW.payroll_commission_base * NEW.payroll_commission_rate / 100,2) - existing.amount ELSE -existing.amount END,'RECOVERY','Completed service changed after publication','Owner decision and authorization required',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,'PENDING','SOURCE_EVENT',0,existing.id,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
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
      'COMMISSION','Service commission',round(NEW.payroll_commission_base * NEW.payroll_commission_rate / 100,2),NEW.payroll_commission_rate,NEW.payroll_commission_base,true,false,
      jsonb_build_object('agreementId',NEW.payroll_agreement_id,'basisPolicy',NEW.payroll_commission_basis,'serviceId',NEW.id,'bookingId',NEW.booking_id,'completedAt',NEW.completed_at,'base',NEW.payroll_commission_base::text,'rate',NEW.payroll_commission_rate::text),(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("business_id","source_type","source_id","source_revision","code") DO UPDATE SET payable_on = EXCLUDED.payable_on
      WHERE "PayrollEarning".statement_id IS NULL;
  END IF;
  RETURN NEW;
END $$;



