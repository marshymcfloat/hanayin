CREATE OR REPLACE FUNCTION payroll_booking_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."payment_status",NEW."status",NEW."amount_paid",NEW."grand_total") IS DISTINCT FROM (OLD."payment_status",OLD."status",OLD."amount_paid",OLD."grand_total") THEN
    UPDATE "AvailedService" SET payroll_revision=payroll_revision+1 WHERE booking_id=NEW.id AND paid_in_payslip_id IS NULL AND EXISTS(SELECT 1 FROM "PayrollEarning" e JOIN "PayrollStatement" s ON s.id=e.statement_id WHERE e.source_type='SERVICE' AND e.source_id="AvailedService".id::text AND s.status='PUBLISHED');
    IF NEW."payment_status" = 'PAID' AND NEW."amount_paid" >= NEW."grand_total" AND NEW."status" <> 'CANCELLED' THEN
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





