CREATE TABLE "AttendanceCorrectionRequest" (
 "id" TEXT PRIMARY KEY, "business_id" TEXT NOT NULL, "employee_id" INTEGER NOT NULL,
 "work_date" DATE NOT NULL, "proposed" JSONB NOT NULL, "source_revision" INTEGER NOT NULL,
 "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "revision" INTEGER NOT NULL DEFAULT 0,
 "command_key" TEXT NOT NULL, "reviewed_by" TEXT, "reviewed_at" TIMESTAMP(3), "review_comment" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AttendanceCorrectionRequest_employee_id_business_id_fkey" FOREIGN KEY ("employee_id","business_id") REFERENCES "Employee"("id","business_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AttendanceCorrectionRequest_business_id_command_key_key" ON "AttendanceCorrectionRequest"("business_id","command_key");
CREATE INDEX "AttendanceCorrectionRequest_business_id_employee_id_status_idx" ON "AttendanceCorrectionRequest"("business_id","employee_id","status");
CREATE UNIQUE INDEX "attendance_pending_correction_unique" ON "AttendanceCorrectionRequest"("employee_id","work_date") WHERE status = 'PENDING';
