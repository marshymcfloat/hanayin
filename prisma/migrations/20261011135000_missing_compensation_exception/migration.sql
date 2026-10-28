CREATE OR REPLACE FUNCTION payroll_capture_service() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE agreement record; legacy_rate numeric;
BEGIN
 IF NEW.status='COMPLETED' AND NEW.served_by_id IS NOT NULL AND NEW.completed_at IS NOT NULL AND NEW.payroll_commission_base IS NULL THEN
   SELECT id,commission_rate,commission_basis INTO agreement FROM "CompensationAgreement" WHERE employee_id=NEW.served_by_id AND effective_from<=(NEW.completed_at+interval '8 hours')::date AND (effective_to IS NULL OR effective_to>=(NEW.completed_at+interval '8 hours')::date);
   IF agreement.id IS NOT NULL THEN
     NEW.payroll_commission_rate:=COALESCE(NEW.payroll_commission_rate,agreement.commission_rate);
     NEW.payroll_commission_basis:=agreement.commission_basis; NEW.payroll_agreement_id:=agreement.id;
     NEW.payroll_commission_base:=CASE WHEN NEW.commission_base=0 THEN 0 WHEN agreement.commission_basis='ORIGINAL_PRICE' THEN NEW.price::numeric ELSE NEW.final_price::numeric END;
   ELSE
     SELECT commission_percentage::numeric INTO legacy_rate FROM "Employee" WHERE id=NEW.served_by_id; NEW.payroll_commission_rate:=COALESCE(NEW.payroll_commission_rate,CASE WHEN EXISTS(SELECT 1 FROM "PayrollSettings" p JOIN "Employee" e ON e.business_id=p.business_id WHERE e.id=NEW.served_by_id AND p.mode='ACTIVE') THEN NULL ELSE legacy_rate END);
     NEW.payroll_commission_basis:='CAPTURED_BOOKING_BASE'; NEW.payroll_commission_base:=NEW.commission_base::numeric;
   END IF;
   IF EXISTS(SELECT 1 FROM "Booking" WHERE id=NEW.booking_id AND payment_status='PAID' AND amount_paid>=grand_total AND status<>'CANCELLED') THEN NEW.payroll_payable_at:=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'); END IF;
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



