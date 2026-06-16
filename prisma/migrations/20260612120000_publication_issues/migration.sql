SET search_path TO "pdf_loader";

CREATE TABLE "publications" (
    "id" SERIAL NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "issue_numbers" (
    "id" SERIAL NOT NULL,
    "display_value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_numbers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_issues" (
    "id" SERIAL NOT NULL,
    "publication_id" INTEGER NOT NULL,
    "issue_number_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_issues_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "special_documents"
ADD COLUMN "publication_issue_id" INTEGER;

CREATE UNIQUE INDEX "publications_normalized_name_key" ON "publications"("normalized_name");
CREATE UNIQUE INDEX "issue_numbers_normalized_value_key" ON "issue_numbers"("normalized_value");
CREATE UNIQUE INDEX "publication_issues_publication_issue_number_key" ON "publication_issues"("publication_id", "issue_number_id");
CREATE INDEX "publication_issues_publication_id_idx" ON "publication_issues"("publication_id");
CREATE INDEX "publication_issues_issue_number_id_idx" ON "publication_issues"("issue_number_id");
CREATE INDEX "special_documents_publication_issue_id_idx" ON "special_documents"("publication_issue_id");

ALTER TABLE "publication_issues"
ADD CONSTRAINT "publication_issues_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "publication_issues_issue_number_id_fkey" FOREIGN KEY ("issue_number_id") REFERENCES "issue_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "special_documents"
ADD CONSTRAINT "special_documents_publication_issue_id_fkey" FOREIGN KEY ("publication_issue_id") REFERENCES "publication_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
