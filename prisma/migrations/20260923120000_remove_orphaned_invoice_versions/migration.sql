-- Remove historical invoice versions left behind by the old single-document deletion.
-- An invoice is identified by the same fields used for version selection.
DELETE FROM "pdf_loader"."documents" AS version
WHERE version."document_type_id" = 2
  AND version."is_current" = false
  AND version."document_contour" IS NOT NULL
  AND version."document_number" IS NOT NULL
  AND version."document_number" <> ''
  AND version."document_date" IS NOT NULL
  AND version."supplier_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "pdf_loader"."documents" AS current_version
    WHERE current_version."document_type_id" = version."document_type_id"
      AND current_version."document_contour" = version."document_contour"
      AND current_version."document_number" = version."document_number"
      AND current_version."document_date" = version."document_date"
      AND current_version."supplier_id" = version."supplier_id"
      AND current_version."is_current" = true
  );
