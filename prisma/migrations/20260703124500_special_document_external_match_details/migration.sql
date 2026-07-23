SET search_path TO "pdf_loader";

ALTER TABLE "special_documents"
ADD COLUMN "has_multiple_external_matches" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN "external_match_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "special_document_external_matches" (
  "id" SERIAL PRIMARY KEY,
  "special_document_id" INTEGER NOT NULL,
  "external_edition_id" INTEGER NOT NULL,
  "external_edition_name" TEXT NOT NULL,
  "external_issue_id" INTEGER,
  "external_issue_number" TEXT,
  "quantity" DECIMAL(15, 3) NOT NULL,
  "unit_price" DECIMAL(15, 2),
  "line_base_amount" DECIMAL(15, 2),
  "line_vat_amount" DECIMAL(15, 2),
  "line_total_amount" DECIMAL(15, 2),
  "currency" TEXT NOT NULL DEFAULT 'UAH',
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "special_document_external_matches_special_document_id_fkey"
    FOREIGN KEY ("special_document_id")
    REFERENCES "special_documents"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "special_document_external_matches_special_document_id_idx"
  ON "special_document_external_matches"("special_document_id");

CREATE INDEX "special_document_external_matches_external_edition_id_idx"
  ON "special_document_external_matches"("external_edition_id");

CREATE INDEX "special_document_external_matches_external_issue_id_idx"
  ON "special_document_external_matches"("external_issue_id");
