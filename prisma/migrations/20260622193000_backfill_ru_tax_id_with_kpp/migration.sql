SET search_path TO "pdf_loader";

UPDATE "suppliers"
SET "tax_id" = CONCAT("tax_id", '/', "kpp")
WHERE "kpp" IS NOT NULL
  AND "tax_id" NOT LIKE '%/%';

UPDATE "recipients"
SET "tax_id" = CONCAT("tax_id", '/', "kpp")
WHERE "kpp" IS NOT NULL
  AND "tax_id" NOT LIKE '%/%';
