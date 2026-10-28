ALTER TABLE "LeaveAllocation" ADD COLUMN "paid_in_payslip_id" INTEGER;
ALTER TABLE "LeaveAllocation" ADD CONSTRAINT "LeaveAllocation_paid_in_payslip_id_fkey" FOREIGN KEY ("paid_in_payslip_id") REFERENCES "Payslip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
