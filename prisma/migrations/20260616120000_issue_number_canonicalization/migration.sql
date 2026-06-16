SET search_path TO "pdf_loader";

ALTER TABLE "issue_numbers"
RENAME COLUMN "display_value" TO "raw_value";

ALTER TABLE "issue_numbers"
ADD COLUMN "canonical_value" TEXT;

UPDATE "issue_numbers"
SET "canonical_value" = "raw_value";

ALTER TABLE "issue_numbers"
ALTER COLUMN "canonical_value" SET NOT NULL;
