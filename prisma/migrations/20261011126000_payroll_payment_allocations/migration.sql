CREATE TABLE "PayrollPaymentReconciliation" (
 "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "statement_id" TEXT NOT NULL,
 "payment_date" DATE NOT NULL, "amount" DECIMAL(18,2) NOT NULL, "tax_delta" DECIMAL(18,2) NOT NULL,
 "statement_revision" INTEGER NOT NULL, "source_hash" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "reason" TEXT NOT NULL, "actor_id" TEXT NOT NULL, "command_key" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PayrollPaymentReconciliation_statement_id_business_id_fkey" FOREIGN KEY ("statement_id","business_id") REFERENCES "PayrollStatement"("id","business_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PayrollPaymentReconciliation_business_id_command_key_key" ON "PayrollPaymentReconciliation"("business_id","command_key");
CREATE UNIQUE INDEX "PayrollPaymentReconciliation_id_statement_id_business_id_key" ON "PayrollPaymentReconciliation"("id","statement_id","business_id");
CREATE INDEX "PayrollPaymentReconciliation_business_id_statement_id_idx" ON "PayrollPaymentReconciliation"("business_id","statement_id");
ALTER TABLE "PayrollPayment" ADD COLUMN "reconciliation_id" TEXT;
CREATE UNIQUE INDEX "PayrollPayment_reconciliation_id_key" ON "PayrollPayment"("reconciliation_id");
CREATE UNIQUE INDEX "PayrollPayment_reconciliation_id_statement_id_business_id_key" ON "PayrollPayment"("reconciliation_id","statement_id","business_id");
CREATE UNIQUE INDEX "PayrollPayment_id_statement_id_business_id_key" ON "PayrollPayment"("id","statement_id","business_id");
CREATE UNIQUE INDEX "PayrollStatementLine_id_statement_id_business_id_key" ON "PayrollStatementLine"("id","statement_id","business_id");
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_reconciliation_id_statement_id_business_id_fkey"
 FOREIGN KEY ("reconciliation_id","statement_id","business_id") REFERENCES "PayrollPaymentReconciliation"("id","statement_id","business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "PayrollPaymentAllocation" (
 "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "statement_id" TEXT NOT NULL,
 "payment_id" TEXT NOT NULL, "line_id" TEXT NOT NULL, "amount" DECIMAL(18,2) NOT NULL,
 CONSTRAINT "PayrollPaymentAllocation_payment_id_statement_id_business_id_fkey" FOREIGN KEY ("payment_id","statement_id","business_id") REFERENCES "PayrollPayment"("id","statement_id","business_id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PayrollPaymentAllocation_line_id_statement_id_business_id_fkey" FOREIGN KEY ("line_id","statement_id","business_id") REFERENCES "PayrollStatementLine"("id","statement_id","business_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PayrollPaymentAllocation_payment_id_line_id_key" ON "PayrollPaymentAllocation"("payment_id","line_id");
CREATE INDEX "PayrollPaymentAllocation_business_id_statement_id_idx" ON "PayrollPaymentAllocation"("business_id","statement_id");
CREATE TRIGGER payroll_payment_allocation_immutable BEFORE UPDATE OR DELETE ON "PayrollPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION payroll_protect_child();
