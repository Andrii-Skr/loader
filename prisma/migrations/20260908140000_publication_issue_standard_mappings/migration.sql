CREATE TABLE "pdf_loader"."publication_issue_mappings" (
    "id" SERIAL NOT NULL,
    "publication_issue_id" INTEGER NOT NULL,
    "source_id" INTEGER NOT NULL,
    "external_edition_id" INTEGER NOT NULL,
    "external_edition_name" TEXT NOT NULL,
    "external_issue_id" INTEGER NOT NULL,
    "external_issue_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_issue_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publication_issue_mappings_issue_source_ext_key"
ON "pdf_loader"."publication_issue_mappings"("publication_issue_id", "source_id", "external_edition_id", "external_issue_id");

CREATE INDEX "publication_issue_mappings_publication_issue_id_idx"
ON "pdf_loader"."publication_issue_mappings"("publication_issue_id");

CREATE INDEX "publication_issue_mappings_source_id_idx"
ON "pdf_loader"."publication_issue_mappings"("source_id");

ALTER TABLE "pdf_loader"."publication_issue_mappings"
ADD CONSTRAINT "publication_issue_mappings_publication_issue_id_fkey"
FOREIGN KEY ("publication_issue_id") REFERENCES "pdf_loader"."publication_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pdf_loader"."publication_issue_mappings"
ADD CONSTRAINT "publication_issue_mappings_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "pdf_loader"."external_edition_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
