ALTER TABLE "PayrollNotification" ADD COLUMN "sms_state" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
 ADD COLUMN "sms_message_id" TEXT, ADD COLUMN "sms_attempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "sms_last_error" TEXT;

CREATE FUNCTION payroll_protect_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.certified_at IS NOT NULL THEN RAISE EXCEPTION 'Certified statutory rules are immutable; register a new version'; END IF;
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_rules_immutable BEFORE UPDATE OR DELETE ON "PayrollRulePackage" FOR EACH ROW EXECUTE FUNCTION payroll_protect_rules();

CREATE FUNCTION payroll_retain_service() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id = e.statement_id WHERE e.source_type = 'SERVICE' AND e.source_id = OLD.id::text AND s.status = 'PUBLISHED') THEN
   RAISE EXCEPTION 'Published service evidence must be archived';
 END IF;
 UPDATE "PayrollEarning" SET reversed_at = CURRENT_TIMESTAMP WHERE source_type = 'SERVICE' AND source_id = OLD.id::text AND reversed_at IS NULL;
 RETURN OLD;
END $$;
CREATE TRIGGER payroll_service_retention BEFORE DELETE ON "AvailedService" FOR EACH ROW EXECUTE FUNCTION payroll_retain_service();

CREATE FUNCTION payroll_protect_earning() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.statement_id IS NOT NULL AND EXISTS (SELECT 1 FROM "PayrollStatement" WHERE id = OLD.statement_id AND status = 'PUBLISHED') THEN
   RAISE EXCEPTION 'Published earnings are immutable';
 END IF;
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payroll_earning_immutable BEFORE UPDATE OR DELETE ON "PayrollEarning" FOR EACH ROW EXECUTE FUNCTION payroll_protect_earning();
