-- CreateEnum
CREATE TYPE "BusinessStructure" AS ENUM ('OWNER_EMPLOYEE_SELF_SERVICE', 'MANAGER_LED', 'CASHIER_LED', 'MANAGER_CASHIER');

-- CreateEnum
CREATE TYPE "StaffProfile" AS ENUM ('STAFF', 'MANAGER', 'CASHIER');

-- CreateEnum
CREATE TYPE "StaffPermission" AS ENUM ('BOOKING_CREATE', 'PAYMENT_COLLECT', 'QUEUE_CLAIM_SELF', 'QUEUE_SERVE_SELF', 'QUEUE_OVERRIDE_ALL', 'CATALOG_MANAGE');

-- AlterTable
ALTER TABLE "Business"
ADD COLUMN "structure" "BusinessStructure" NOT NULL DEFAULT 'OWNER_EMPLOYEE_SELF_SERVICE',
ADD COLUMN "allow_employee_self_booking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "manager_can_serve" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "OnboardingApplication"
ADD COLUMN "requested_structure" "BusinessStructure" NOT NULL DEFAULT 'OWNER_EMPLOYEE_SELF_SERVICE',
ADD COLUMN "requested_allow_employee_self_booking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "requested_manager_can_serve" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN "profile" "StaffProfile" NOT NULL DEFAULT 'STAFF',
ADD COLUMN "permissions" "StaffPermission"[] NOT NULL DEFAULT ARRAY['BOOKING_CREATE', 'PAYMENT_COLLECT', 'QUEUE_CLAIM_SELF', 'QUEUE_SERVE_SELF']::"StaffPermission"[];
