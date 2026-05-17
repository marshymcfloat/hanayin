-- Rename User.email to User.contact_number.
-- Authentication identity is now the user's Philippine mobile number
-- (normalized as 639XXXXXXXXX) so employees can be invited via SMS via
-- Semaphore instead of email. Owner accounts use the same field.
--
-- Existing rows: any prior values get carried over verbatim. If any row
-- holds a non-phone value (legacy email), it must be backfilled to a
-- valid contact number before users can sign in. The deployment plan
-- accepts that current dev seed/test data is reset, so no backfill is
-- shipped here.

-- Drop the old unique index so we can rename the column.
DROP INDEX "User_email_key";

ALTER TABLE "User" RENAME COLUMN "email" TO "contact_number";

CREATE UNIQUE INDEX "User_contact_number_key" ON "User"("contact_number");
