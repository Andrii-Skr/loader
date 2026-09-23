-- Keep only the publication brand; publisher descriptors are not stored.
UPDATE "pdf_loader"."suppliers"
SET "name" = regexp_replace(
  "name",
  '^\\s*["«„“]?\\s*(видавництво|видавничий\\s+дім)\\s+',
  '',
  'i'
)
WHERE "name" ~* '^\\s*["«„“]?\\s*(видавництво|видавничий\\s+дім)\\s+';

UPDATE "pdf_loader"."recipients"
SET "name" = regexp_replace(
  "name",
  '^\\s*["«„“]?\\s*(видавництво|видавничий\\s+дім)\\s+',
  '',
  'i'
)
WHERE "name" ~* '^\\s*["«„“]?\\s*(видавництво|видавничий\\s+дім)\\s+';
