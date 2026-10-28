ALTER TABLE "LeaveEntitlement" ADD COLUMN "converted_units" DECIMAL(8,3) NOT NULL DEFAULT 0;
ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "leave_conversion_units" CHECK (converted_units>=0 AND converted_units<=granted_units);
