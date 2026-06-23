SET search_path TO "pdf_loader";

ALTER TABLE "suppliers"
ADD COLUMN "kpp" TEXT;

ALTER TABLE "recipients"
ADD COLUMN "kpp" TEXT;

ALTER TABLE "special_documents"
ADD COLUMN "item_type_code" TEXT,
ADD COLUMN "excise_amount" DECIMAL(15,2),
ADD COLUMN "line_total_amount" DECIMAL(15,2),
ADD COLUMN "country_code" TEXT,
ADD COLUMN "country_name" TEXT,
ADD COLUMN "customs_declaration_number" TEXT;
