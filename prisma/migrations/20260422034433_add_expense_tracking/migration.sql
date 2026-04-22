-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SUPPLIES', 'UTILITIES', 'RENT', 'EQUIPMENT', 'MARKETING', 'MAINTENANCE', 'PROFESSIONAL', 'MISCELLANEOUS');

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "business_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_business_id_date_idx" ON "Expense"("business_id", "date");

-- CreateIndex
CREATE INDEX "Expense_business_id_category_idx" ON "Expense"("business_id", "category");

-- CreateIndex
CREATE INDEX "Expense_business_id_date_category_idx" ON "Expense"("business_id", "date", "category");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
