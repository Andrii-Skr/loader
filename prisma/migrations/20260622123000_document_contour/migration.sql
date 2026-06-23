SET search_path TO "pdf_loader";

-- CreateEnum
CREATE TYPE "DocumentContour" AS ENUM ('UA', 'RU');

-- AlterTable
ALTER TABLE "documents"
ADD COLUMN "document_contour" "DocumentContour";

-- Backfill existing rows into the legacy UA contour
UPDATE "documents"
SET "document_contour" = 'UA'
WHERE "document_contour" IS NULL
  AND "parser_version" = 'vat-invoice-ua-v1';

-- DropIndex
DROP INDEX IF EXISTS "documents_number_date_supplier_key";

-- CreateIndex
CREATE INDEX "documents_document_contour_idx" ON "documents"("document_contour");

-- CreateIndex
CREATE UNIQUE INDEX "documents_contour_number_date_supplier_key"
ON "documents"("document_contour", "document_number", "document_date", "supplier_id");
