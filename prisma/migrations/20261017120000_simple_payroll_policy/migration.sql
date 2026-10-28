CREATE TYPE "PayrollCalculationPolicy" AS ENUM ('SIMPLE', 'GOVERNMENT');

-- Existing settings and all historical runs retain their original calculation.
ALTER TABLE "PayrollSettings"
  ADD COLUMN "calculation_policy" "PayrollCalculationPolicy" NOT NULL DEFAULT 'GOVERNMENT',
  ADD COLUMN "simple_effective_from" DATE,
  ADD COLUMN "government_effective_from" DATE;
ALTER TABLE "PayrollSettings" ALTER COLUMN "calculation_policy" SET DEFAULT 'SIMPLE';
ALTER TABLE "PayrollRun"
  ADD COLUMN "calculation_policy" "PayrollCalculationPolicy" NOT NULL DEFAULT 'GOVERNMENT';
ALTER TABLE "PayrollAdjustment" ADD COLUMN "label" TEXT;

CREATE FUNCTION payroll_run_policy_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.calculation_policy IS DISTINCT FROM OLD.calculation_policy THEN
    RAISE EXCEPTION 'A payroll run retains its original calculation policy';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payroll_run_policy_immutable BEFORE UPDATE ON "PayrollRun"
  FOR EACH ROW EXECUTE FUNCTION payroll_run_policy_immutable();

CREATE OR REPLACE FUNCTION payroll_statement_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settled numeric; expected_state text; policy "PayrollCalculationPolicy";
BEGIN
 IF NEW.status='PUBLISHED' THEN
   SELECT calculation_policy INTO policy FROM "PayrollRun" WHERE id=NEW.run_id AND business_id=NEW.business_id;
   SELECT COALESCE(sum(amount),0) INTO settled FROM "PayrollPayment" WHERE statement_id=NEW.id;
   expected_state:=CASE WHEN policy='SIMPLE' AND settled=0 AND NEW.net=0 THEN 'UNPAID'
     WHEN settled=NEW.net THEN 'PAID' WHEN settled>0 THEN 'PARTIAL' ELSE 'UNPAID' END;
   IF NEW.paid_amount<>settled OR NEW.payment_state::text<>expected_state THEN
     RAISE EXCEPTION 'Statement settlement must match immutable payment records';
   END IF;
 END IF;
 RETURN NEW;
END $$;
