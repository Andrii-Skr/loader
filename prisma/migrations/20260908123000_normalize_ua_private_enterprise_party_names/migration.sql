-- Keep only the counterparty name; the Ukrainian private-enterprise legal form is not stored.
UPDATE "pdf_loader"."suppliers"
SET "name" = regexp_replace("name", '^\\s*приватне\\s+підприємство\\s+', '', 'i')
WHERE "name" ~* '^\\s*приватне\\s+підприємство\\s+';

UPDATE "pdf_loader"."recipients"
SET "name" = regexp_replace("name", '^\\s*приватне\\s+підприємство\\s+', '', 'i')
WHERE "name" ~* '^\\s*приватне\\s+підприємство\\s+';
