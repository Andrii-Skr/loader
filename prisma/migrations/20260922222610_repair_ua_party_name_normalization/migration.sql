-- Repair the earlier normalization migrations. PostgreSQL standard strings keep
-- double backslashes verbatim, so their `\\s` patterns did not match spaces.
-- POSIX character classes avoid depending on string escape settings.

UPDATE "pdf_loader"."suppliers"
SET "name" = regexp_replace(
  "name",
  '^[[:space:]]*(товариство|товаристо)[[:space:]]+з[[:space:]]+обмеженою[[:space:]]+відповідальністю[[:space:]]+',
  '',
  'i'
)
WHERE "name" ~* '^[[:space:]]*(товариство|товаристо)[[:space:]]+з[[:space:]]+обмеженою[[:space:]]+відповідальністю[[:space:]]+';

UPDATE "pdf_loader"."recipients"
SET "name" = regexp_replace(
  "name",
  '^[[:space:]]*(товариство|товаристо)[[:space:]]+з[[:space:]]+обмеженою[[:space:]]+відповідальністю[[:space:]]+',
  '',
  'i'
)
WHERE "name" ~* '^[[:space:]]*(товариство|товаристо)[[:space:]]+з[[:space:]]+обмеженою[[:space:]]+відповідальністю[[:space:]]+';

UPDATE "pdf_loader"."suppliers"
SET "name" = regexp_replace("name", '^[[:space:]]*приватне[[:space:]]+підприємство[[:space:]]+', '', 'i')
WHERE "name" ~* '^[[:space:]]*приватне[[:space:]]+підприємство[[:space:]]+';

UPDATE "pdf_loader"."recipients"
SET "name" = regexp_replace("name", '^[[:space:]]*приватне[[:space:]]+підприємство[[:space:]]+', '', 'i')
WHERE "name" ~* '^[[:space:]]*приватне[[:space:]]+підприємство[[:space:]]+';

UPDATE "pdf_loader"."suppliers"
SET "name" = regexp_replace(
  "name",
  '^[[:space:]]*["«„“]?[[:space:]]*(видавництво|видавничий[[:space:]]+дім)[[:space:]]+',
  '',
  'i'
)
WHERE "name" ~* '^[[:space:]]*["«„“]?[[:space:]]*(видавництво|видавничий[[:space:]]+дім)[[:space:]]+';

UPDATE "pdf_loader"."recipients"
SET "name" = regexp_replace(
  "name",
  '^[[:space:]]*["«„“]?[[:space:]]*(видавництво|видавничий[[:space:]]+дім)[[:space:]]+',
  '',
  'i'
)
WHERE "name" ~* '^[[:space:]]*["«„“]?[[:space:]]*(видавництво|видавничий[[:space:]]+дім)[[:space:]]+';
