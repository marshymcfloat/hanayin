DROP INDEX IF EXISTS "PayrollStatementLine_earning_id_key";
CREATE INDEX IF NOT EXISTS "PayrollStatementLine_earning_id_idx" ON "PayrollStatementLine"("earning_id");
ALTER TABLE "PayrollStatement" DROP CONSTRAINT "payroll_statement_balance";
ALTER TABLE "PayrollStatement" ADD CONSTRAINT "payroll_statement_balance"
  CHECK ("paid_amount" >= 0 AND "gross" - "deductions" = "net" AND ("status" <> 'PUBLISHED' OR ("paid_amount" <= "net" AND "net" >= 0)));
