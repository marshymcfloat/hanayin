-- CreateEnum
CREATE TYPE "PayrollMode" AS ENUM ('LEGACY', 'SHADOW', 'ACTIVE');

-- CreateEnum
CREATE TYPE "PayrollPayBasis" AS ENUM ('DAILY', 'MONTHLY', 'HOURLY');

-- CreateEnum
CREATE TYPE "PayrollStatementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'VOID');

-- CreateEnum
CREATE TYPE "PayrollPaymentState" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- AlterEnum
ALTER TYPE "OwnerPermission" ADD VALUE 'WORKFORCE_MANAGE';

-- DropForeignKey
ALTER TABLE "Payslip" DROP CONSTRAINT "Payslip_employee_id_fkey";

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "benefit_code" TEXT NOT NULL DEFAULT 'DISCRETIONARY',
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "employment_end" DATE,
ADD COLUMN     "employment_start" DATE,
ADD COLUMN     "financial_revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EmployeeAttendance" ADD COLUMN     "payroll_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "payroll_confirmed_by" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AvailedService" ADD COLUMN     "payroll_commission_rate" DECIMAL(9,6),
ADD COLUMN     "payroll_payable_at" TIMESTAMP(3),
ADD COLUMN     "payroll_revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "business_id" TEXT NOT NULL,
    "mode" "PayrollMode" NOT NULL DEFAULT 'LEGACY',
    "cadence" TEXT NOT NULL DEFAULT 'SEMIMONTHLY',
    "pay_days" INTEGER[] DEFAULT ARRAY[15, 30]::INTEGER[],
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rule_package_id" TEXT,
    "opening_confirmed_at" TIMESTAMP(3),
    "reconciliation" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("business_id")
);

-- CreateTable
CREATE TABLE "PayrollRulePackage" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'PH',
    "effective_from" DATE NOT NULL,
    "supported_through" DATE NOT NULL,
    "rules" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "certified_by" TEXT,
    "certified_at" TIMESTAMP(3),
    "certification_evidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRulePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationAgreement" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "basis" "PayrollPayBasis" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "normal_hours" DECIMAL(6,2) NOT NULL,
    "monthly_divisor" DECIMAL(8,3),
    "commission_rate" DECIMAL(9,6) NOT NULL,
    "commission_basis" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompensationAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayrollProfile" (
    "employee_id" INTEGER NOT NULL,
    "business_id" TEXT NOT NULL,
    "encrypted_identifiers" TEXT,
    "eligibility" JSONB NOT NULL,
    "work_region" TEXT NOT NULL,
    "wage_category" TEXT NOT NULL,
    "monthly_basic" DECIMAL(18,2) NOT NULL,
    "ytd_opening" JSONB NOT NULL,
    "opening_confirmed_at" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayrollProfile_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "WorkforceSession" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "work_date" DATE NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "breaks" JSONB NOT NULL DEFAULT '[]',
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkforceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRevision" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "work_date" DATE NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "command_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveEntitlement" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "benefit_code" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "granted_units" DECIMAL(8,3) NOT NULL,
    "evidence" TEXT NOT NULL,
    "funding" TEXT NOT NULL DEFAULT 'EMPLOYER',
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LeaveEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveAllocation" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "leave_request_id" INTEGER NOT NULL,
    "entitlement_id" TEXT,
    "work_date" DATE NOT NULL,
    "units" DECIMAL(8,3) NOT NULL,
    "paid" BOOLEAN NOT NULL,
    "benefit_code" TEXT NOT NULL,
    "funding" TEXT NOT NULL DEFAULT 'EMPLOYER',
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "LeaveAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEarning" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_revision" INTEGER NOT NULL,
    "earned_on" DATE NOT NULL,
    "payable_on" DATE,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "units" DECIMAL(18,6) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_basic" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "statement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "payment_date" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REGULAR',
    "created_by" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollStatement" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "status" "PayrollStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_state" "PayrollPaymentState" NOT NULL DEFAULT 'UNPAID',
    "gross" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "employer_cost" DECIMAL(18,2) NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "review_hash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "legacy_payslip_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollStatementLine" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "earning_id" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "rate" DECIMAL(18,6),
    "units" DECIMAL(18,6),
    "category" TEXT NOT NULL,
    "source" JSONB NOT NULL,

    CONSTRAINT "PayrollStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAssessment" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "rule_package_id" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "assessment_month" TEXT NOT NULL,
    "employee_share" DECIMAL(18,2) NOT NULL,
    "employer_share" DECIMAL(18,2) NOT NULL,
    "basis" DECIMAL(18,2) NOT NULL,
    "explanation" JSONB NOT NULL,

    CONSTRAINT "PayrollAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPayment" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "command_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "original_statement_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorization" TEXT NOT NULL,
    "effective_on" DATE NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'PENDING',
    "actor_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "earning_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCommand" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollNotification" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompensationAgreement_business_id_employee_id_effective_fro_idx" ON "CompensationAgreement"("business_id", "employee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollProfile_employee_id_business_id_key" ON "EmployeePayrollProfile"("employee_id", "business_id");

-- CreateIndex
CREATE INDEX "WorkforceSession_business_id_employee_id_work_date_idx" ON "WorkforceSession"("business_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "AttendanceRevision_business_id_employee_id_work_date_idx" ON "AttendanceRevision"("business_id", "employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRevision_business_id_command_key_key" ON "AttendanceRevision"("business_id", "command_key");

-- CreateIndex
CREATE INDEX "LeaveEntitlement_business_id_employee_id_idx" ON "LeaveEntitlement"("business_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveEntitlement_employee_id_benefit_code_period_start_key" ON "LeaveEntitlement"("employee_id", "benefit_code", "period_start");

-- CreateIndex
CREATE INDEX "LeaveAllocation_business_id_employee_id_work_date_idx" ON "LeaveAllocation"("business_id", "employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveAllocation_leave_request_id_work_date_key" ON "LeaveAllocation"("leave_request_id", "work_date");

-- CreateIndex
CREATE INDEX "PayrollEarning_business_id_employee_id_payable_on_idx" ON "PayrollEarning"("business_id", "employee_id", "payable_on");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEarning_business_id_source_type_source_id_source_rev_key" ON "PayrollEarning"("business_id", "source_type", "source_id", "source_revision", "code");

-- CreateIndex
CREATE INDEX "PayrollRun_business_id_start_date_end_date_idx" ON "PayrollRun"("business_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_id_business_id_key" ON "PayrollRun"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollStatement_legacy_payslip_id_key" ON "PayrollStatement"("legacy_payslip_id");

-- CreateIndex
CREATE INDEX "PayrollStatement_business_id_employee_id_published_at_idx" ON "PayrollStatement"("business_id", "employee_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollStatement_id_business_id_key" ON "PayrollStatement"("id", "business_id");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollStatement_run_id_employee_id_key" ON "PayrollStatement"("run_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollStatementLine_earning_id_key" ON "PayrollStatementLine"("earning_id");

-- CreateIndex
CREATE INDEX "PayrollStatementLine_statement_id_idx" ON "PayrollStatementLine"("statement_id");

-- CreateIndex
CREATE INDEX "PayrollAssessment_business_id_assessment_month_agency_idx" ON "PayrollAssessment"("business_id", "assessment_month", "agency");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAssessment_statement_id_agency_assessment_month_key" ON "PayrollAssessment"("statement_id", "agency", "assessment_month");

-- CreateIndex
CREATE INDEX "PayrollPayment_business_id_payment_date_idx" ON "PayrollPayment"("business_id", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPayment_business_id_command_key_key" ON "PayrollPayment"("business_id", "command_key");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAdjustment_earning_id_key" ON "PayrollAdjustment"("earning_id");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_business_id_employee_id_disposition_idx" ON "PayrollAdjustment"("business_id", "employee_id", "disposition");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCommand_business_id_key_key" ON "PayrollCommand"("business_id", "key");

-- CreateIndex
CREATE INDEX "PayrollNotification_business_id_user_id_read_at_idx" ON "PayrollNotification"("business_id", "user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollNotification_statement_id_user_id_key" ON "PayrollNotification"("statement_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_id_business_id_key" ON "Employee"("id", "business_id");

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_rule_package_id_fkey" FOREIGN KEY ("rule_package_id") REFERENCES "PayrollRulePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationAgreement" ADD CONSTRAINT "CompensationAgreement_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollProfile" ADD CONSTRAINT "EmployeePayrollProfile_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceSession" ADD CONSTRAINT "WorkforceSession_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRevision" ADD CONSTRAINT "AttendanceRevision_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAllocation" ADD CONSTRAINT "LeaveAllocation_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAllocation" ADD CONSTRAINT "LeaveAllocation_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAllocation" ADD CONSTRAINT "LeaveAllocation_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "LeaveEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEarning" ADD CONSTRAINT "PayrollEarning_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEarning" ADD CONSTRAINT "PayrollEarning_statement_id_business_id_fkey" FOREIGN KEY ("statement_id", "business_id") REFERENCES "PayrollStatement"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollStatement" ADD CONSTRAINT "PayrollStatement_run_id_business_id_fkey" FOREIGN KEY ("run_id", "business_id") REFERENCES "PayrollRun"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollStatement" ADD CONSTRAINT "PayrollStatement_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollStatementLine" ADD CONSTRAINT "PayrollStatementLine_statement_id_business_id_fkey" FOREIGN KEY ("statement_id", "business_id") REFERENCES "PayrollStatement"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollStatementLine" ADD CONSTRAINT "PayrollStatementLine_earning_id_fkey" FOREIGN KEY ("earning_id") REFERENCES "PayrollEarning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAssessment" ADD CONSTRAINT "PayrollAssessment_statement_id_business_id_fkey" FOREIGN KEY ("statement_id", "business_id") REFERENCES "PayrollStatement"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAssessment" ADD CONSTRAINT "PayrollAssessment_rule_package_id_fkey" FOREIGN KEY ("rule_package_id") REFERENCES "PayrollRulePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_statement_id_business_id_fkey" FOREIGN KEY ("statement_id", "business_id") REFERENCES "PayrollStatement"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employee_id_business_id_fkey" FOREIGN KEY ("employee_id", "business_id") REFERENCES "Employee"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_original_statement_id_business_id_fkey" FOREIGN KEY ("original_statement_id", "business_id") REFERENCES "PayrollStatement"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCommand" ADD CONSTRAINT "PayrollCommand_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollNotification" ADD CONSTRAINT "PayrollNotification_statement_id_business_id_fkey" FOREIGN KEY ("statement_id", "business_id") REFERENCES "PayrollStatement"("id", "business_id") ON DELETE RESTRICT ON UPDATE CASCADE;
