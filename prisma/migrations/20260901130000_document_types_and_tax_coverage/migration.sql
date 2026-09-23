SET search_path TO "pdf_loader";

CREATE TYPE "TaxCoverageStatus" AS ENUM (
  'NOT_APPLICABLE',
  'NO_CANDIDATES',
  'NEEDS_SELECTION',
  'MATCHED'
);

CREATE TABLE "document_types" (
  "id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_types_name_key" ON "document_types"("name");

INSERT INTO "document_types" ("id", "name", "updated_at")
VALUES (1, 'Tax invoice', CURRENT_TIMESTAMP), (2, 'Invoice', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name";

ALTER TABLE "documents"
  ADD COLUMN "document_type_id" INTEGER,
  ADD COLUMN "has_tax_invoice" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "content_hash" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "supersedes_id" INTEGER,
  ADD COLUMN "tax_coverage_status" "TaxCoverageStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';

UPDATE "documents"
SET "document_type_id" = 1,
    "tax_coverage_status" = 'NO_CANDIDATES';

ALTER TABLE "documents"
  ALTER COLUMN "document_type_id" SET NOT NULL;

DROP INDEX IF EXISTS "documents_contour_number_date_supplier_key";

CREATE UNIQUE INDEX "documents_type_contour_number_date_supplier_revision_key"
  ON "documents"("document_type_id", "document_contour", "document_number", "document_date", "supplier_id", "revision");
CREATE INDEX "documents_document_type_id_idx" ON "documents"("document_type_id");
CREATE INDEX "documents_is_current_idx" ON "documents"("is_current");
CREATE INDEX "documents_content_hash_idx" ON "documents"("content_hash");

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_document_type_id_fkey"
    FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "documents_supersedes_id_fkey"
    FOREIGN KEY ("supersedes_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "document_tax_coverages" (
  "id" SERIAL NOT NULL,
  "invoice_document_id" INTEGER NOT NULL,
  "tax_invoice_document_id" INTEGER NOT NULL,
  "is_automatic" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_tax_coverages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_tax_coverages_tax_invoice_document_id_key"
  ON "document_tax_coverages"("tax_invoice_document_id");
CREATE UNIQUE INDEX "document_tax_coverages_invoice_tax_key"
  ON "document_tax_coverages"("invoice_document_id", "tax_invoice_document_id");
CREATE INDEX "document_tax_coverages_invoice_document_id_idx"
  ON "document_tax_coverages"("invoice_document_id");

ALTER TABLE "document_tax_coverages"
  ADD CONSTRAINT "document_tax_coverages_invoice_document_id_fkey"
    FOREIGN KEY ("invoice_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "document_tax_coverages_tax_invoice_document_id_fkey"
    FOREIGN KEY ("tax_invoice_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
