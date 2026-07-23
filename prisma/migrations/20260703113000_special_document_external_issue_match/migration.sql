SET search_path TO "pdf_loader";

ALTER TABLE "special_documents"
ADD COLUMN "matched_external_edition_id" INTEGER,
ADD COLUMN "matched_external_issue_id" INTEGER,
ADD COLUMN "matched_external_issue_number" TEXT;
