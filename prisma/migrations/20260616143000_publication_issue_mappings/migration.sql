SET search_path TO "pdf_loader";

CREATE TABLE "external_edition_sources" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_edition_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_mappings" (
    "id" SERIAL NOT NULL,
    "publication_id" INTEGER NOT NULL,
    "source_id" INTEGER NOT NULL,
    "external_edition_id" INTEGER NOT NULL,
    "external_edition_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "issue_number_mappings" (
    "id" SERIAL NOT NULL,
    "issue_number_id" INTEGER NOT NULL,
    "source_id" INTEGER NOT NULL,
    "external_issue_id" INTEGER NOT NULL,
    "external_issue_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_number_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_edition_sources_code_key" ON "external_edition_sources"("code");
CREATE UNIQUE INDEX "publication_mappings_pub_source_ext_edition_key" ON "publication_mappings"("publication_id", "source_id", "external_edition_id");
CREATE UNIQUE INDEX "issue_number_mappings_issue_source_ext_issue_key" ON "issue_number_mappings"("issue_number_id", "source_id", "external_issue_id");

CREATE INDEX "publication_mappings_publication_id_idx" ON "publication_mappings"("publication_id");
CREATE INDEX "publication_mappings_source_id_idx" ON "publication_mappings"("source_id");
CREATE INDEX "publication_mappings_external_edition_id_idx" ON "publication_mappings"("external_edition_id");
CREATE INDEX "issue_number_mappings_issue_number_id_idx" ON "issue_number_mappings"("issue_number_id");
CREATE INDEX "issue_number_mappings_source_id_idx" ON "issue_number_mappings"("source_id");
CREATE INDEX "issue_number_mappings_external_issue_id_idx" ON "issue_number_mappings"("external_issue_id");

ALTER TABLE "publication_mappings"
ADD CONSTRAINT "publication_mappings_publication_id_fkey"
FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publication_mappings"
ADD CONSTRAINT "publication_mappings_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "external_edition_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_number_mappings"
ADD CONSTRAINT "issue_number_mappings_issue_number_id_fkey"
FOREIGN KEY ("issue_number_id") REFERENCES "issue_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_number_mappings"
ADD CONSTRAINT "issue_number_mappings_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "external_edition_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
