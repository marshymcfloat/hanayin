CREATE OR REPLACE FUNCTION payroll_protect_work_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id
   WHERE e.business_id=OLD.business_id AND e.employee_id=OLD.employee_id
     AND e.source_type IN ('WORKDAY','LEAVE_AWARD') AND e.earned_on=OLD.work_date AND s.status='PUBLISHED'
 ) THEN RAISE EXCEPTION 'Published work or leave evidence requires a linked adjustment'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
