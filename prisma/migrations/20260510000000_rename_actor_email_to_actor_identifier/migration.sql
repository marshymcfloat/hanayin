-- Rename PlatformActionLog.actor_email -> actor_identifier. The column has
-- always actually stored phone numbers (session.user.contactNumber); the old
-- name broke filtering/redaction tooling that assumed email-shaped values.
ALTER TABLE "PlatformActionLog" RENAME COLUMN "actor_email" TO "actor_identifier";
