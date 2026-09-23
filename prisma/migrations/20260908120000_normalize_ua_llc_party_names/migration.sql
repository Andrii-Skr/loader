-- Keep only the counterparty name; the Ukrainian LLC legal form is not displayed or stored.
-- The second variant repairs the common OCR spelling "товаристо".
UPDATE "pdf_loader"."suppliers"
SET "name" = regexp_replace(
  "name",
  '^\\s*(товариство|товаристо)\\s+з\\s+обмеженою\\s+відповідальністю\\s+',
  '',
  'i'
)
WHERE "name" ~* '^\\s*(товариство|товаристо)\\s+з\\s+обмеженою\\s+відповідальністю\\s+';

UPDATE "pdf_loader"."recipients"
SET "name" = regexp_replace(
  "name",
  '^\\s*(товариство|товаристо)\\s+з\\s+обмеженою\\s+відповідальністю\\s+',
  '',
  'i'
)
WHERE "name" ~* '^\\s*(товариство|товаристо)\\s+з\\s+обмеженою\\s+відповідальністю\\s+';
