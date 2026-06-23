SET search_path TO "pdf_loader";

UPDATE "documents"
SET "currency" = 'RUB'
WHERE "document_contour" = 'RU'
  AND "currency" <> 'RUB';
