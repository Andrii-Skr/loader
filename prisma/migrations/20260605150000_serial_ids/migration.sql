SET search_path TO "pdf_loader";

ALTER TABLE "documents"
DROP CONSTRAINT "documents_supplier_id_fkey",
DROP CONSTRAINT "documents_recipient_id_fkey",
DROP CONSTRAINT "documents_uploaded_by_id_fkey";

ALTER TABLE "special_documents"
DROP CONSTRAINT "special_documents_document_id_fkey";

ALTER TABLE "accounts"
DROP CONSTRAINT "accounts_user_id_fkey";

ALTER TABLE "sessions"
DROP CONSTRAINT "sessions_user_id_fkey";

DROP INDEX IF EXISTS "documents_supplier_id_idx";
DROP INDEX IF EXISTS "documents_recipient_id_idx";
DROP INDEX IF EXISTS "documents_uploaded_by_id_idx";
DROP INDEX IF EXISTS "documents_number_date_supplier_key";
DROP INDEX IF EXISTS "special_documents_document_id_idx";
DROP INDEX IF EXISTS "special_documents_document_line_key";
DROP INDEX IF EXISTS "accounts_user_id_idx";
DROP INDEX IF EXISTS "sessions_user_id_idx";

ALTER TABLE "suppliers" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "recipients" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "users" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "documents" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "special_documents" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "accounts" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "sessions" ADD COLUMN "id_new" SERIAL;

ALTER TABLE "documents"
ADD COLUMN "supplier_id_new" INTEGER,
ADD COLUMN "recipient_id_new" INTEGER,
ADD COLUMN "uploaded_by_id_new" INTEGER;

ALTER TABLE "special_documents"
ADD COLUMN "document_id_new" INTEGER;

ALTER TABLE "accounts"
ADD COLUMN "user_id_new" INTEGER;

ALTER TABLE "sessions"
ADD COLUMN "user_id_new" INTEGER;

UPDATE "documents" AS d
SET "supplier_id_new" = s."id_new"
FROM "suppliers" AS s
WHERE d."supplier_id" = s."id";

UPDATE "documents" AS d
SET "recipient_id_new" = r."id_new"
FROM "recipients" AS r
WHERE d."recipient_id" = r."id";

UPDATE "documents" AS d
SET "uploaded_by_id_new" = u."id_new"
FROM "users" AS u
WHERE d."uploaded_by_id" = u."id";

UPDATE "special_documents" AS sd
SET "document_id_new" = d."id_new"
FROM "documents" AS d
WHERE sd."document_id" = d."id";

UPDATE "accounts" AS a
SET "user_id_new" = u."id_new"
FROM "users" AS u
WHERE a."user_id" = u."id";

UPDATE "sessions" AS s
SET "user_id_new" = u."id_new"
FROM "users" AS u
WHERE s."user_id" = u."id";

ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_pkey";
ALTER TABLE "recipients" DROP CONSTRAINT "recipients_pkey";
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";
ALTER TABLE "documents" DROP CONSTRAINT "documents_pkey";
ALTER TABLE "special_documents" DROP CONSTRAINT "special_documents_pkey";
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey";
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey";

ALTER TABLE "documents"
DROP COLUMN "supplier_id",
DROP COLUMN "recipient_id",
DROP COLUMN "uploaded_by_id";

ALTER TABLE "special_documents"
DROP COLUMN "document_id";

ALTER TABLE "accounts"
DROP COLUMN "user_id";

ALTER TABLE "sessions"
DROP COLUMN "user_id";

ALTER TABLE "suppliers" DROP COLUMN "id";
ALTER TABLE "recipients" DROP COLUMN "id";
ALTER TABLE "users" DROP COLUMN "id";
ALTER TABLE "documents" DROP COLUMN "id";
ALTER TABLE "special_documents" DROP COLUMN "id";
ALTER TABLE "accounts" DROP COLUMN "id";
ALTER TABLE "sessions" DROP COLUMN "id";

ALTER TABLE "suppliers" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "recipients" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "users" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "documents" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "special_documents" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "accounts" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "sessions" RENAME COLUMN "id_new" TO "id";

ALTER TABLE "documents" RENAME COLUMN "supplier_id_new" TO "supplier_id";
ALTER TABLE "documents" RENAME COLUMN "recipient_id_new" TO "recipient_id";
ALTER TABLE "documents" RENAME COLUMN "uploaded_by_id_new" TO "uploaded_by_id";
ALTER TABLE "special_documents" RENAME COLUMN "document_id_new" TO "document_id";
ALTER TABLE "accounts" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "sessions" RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_pkey" PRIMARY KEY ("id");
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE "documents" ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");
ALTER TABLE "special_documents" ADD CONSTRAINT "special_documents_pkey" PRIMARY KEY ("id");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE "special_documents"
ALTER COLUMN "document_id" SET NOT NULL;

ALTER TABLE "accounts"
ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "sessions"
ALTER COLUMN "user_id" SET NOT NULL;

CREATE INDEX "documents_supplier_id_idx" ON "documents"("supplier_id");
CREATE INDEX "documents_recipient_id_idx" ON "documents"("recipient_id");
CREATE INDEX "documents_uploaded_by_id_idx" ON "documents"("uploaded_by_id");
CREATE UNIQUE INDEX "documents_number_date_supplier_key" ON "documents"("document_number", "document_date", "supplier_id");
CREATE INDEX "special_documents_document_id_idx" ON "special_documents"("document_id");
CREATE UNIQUE INDEX "special_documents_document_line_key" ON "special_documents"("document_id", "line_no");
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

ALTER TABLE "documents"
ADD CONSTRAINT "documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "documents_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "special_documents"
ADD CONSTRAINT "special_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts"
ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
