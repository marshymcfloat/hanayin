ALTER TABLE "EmployeePayrollProfile" ADD COLUMN "eligibility_history" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "opening_history" JSONB NOT NULL DEFAULT '{}';
