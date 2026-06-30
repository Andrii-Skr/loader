SET search_path TO "pdf_loader";

ALTER TABLE "special_documents"
ADD COLUMN "publication_issue_confirmed_at" TIMESTAMP(3);
