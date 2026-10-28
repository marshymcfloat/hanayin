ALTER TABLE "LeaveEntitlement" ADD COLUMN "award" JSONB;
CREATE TABLE "PayrollServiceChargePool" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "business_id" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reference" TEXT NOT NULL,
  "from" DATE NOT NULL,
  "to" DATE NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK (amount > 0),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "review_hash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actor_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("to" >= "from"),
  UNIQUE ("business_id", "reference"),
  UNIQUE ("id", "business_id")
);
CREATE FUNCTION payroll_pool_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recorded service-charge evidence is immutable; use a reviewed adjustment'; END;
$$;
CREATE TRIGGER payroll_pool_immutable BEFORE UPDATE OR DELETE ON "PayrollServiceChargePool" FOR EACH ROW EXECUTE FUNCTION payroll_pool_immutable();
CREATE FUNCTION payroll_leave_award_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.award IS DISTINCT FROM NEW.award AND EXISTS (
    SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id
    WHERE e.business_id=OLD.business_id AND e.source_type='LEAVE_AWARD' AND e.source_id LIKE OLD.id || ':%' AND s.status='PUBLISHED'
  ) THEN RAISE EXCEPTION 'Published leave award evidence is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payroll_leave_award_guard BEFORE UPDATE ON "LeaveEntitlement" FOR EACH ROW EXECUTE FUNCTION payroll_leave_award_guard();
