const legalFormPrefix =
  /^(?:(?:товариство|товаристо)\s+з\s+обмеженою\s+відповідальністю|приватне\s+підприємство)\s+/iu;
const publisherPrefix = /^(?:["«„“]\s*)?(?:видавництво|видавничий\s+дім)\s+/iu;

/**
 * Stores a counterparty's own name without Ukrainian legal-form or publisher prefixes.
 * `товаристо` covers a frequent OCR substitution for `товариство`.
 */
export const normalizePartyName = (value: string): string => {
  const normalized = value.trim().replace(/\s+/gu, " ");
  const withoutLegalForm = normalized.replace(legalFormPrefix, "").trim();
  const withoutPublisherPrefix = withoutLegalForm.replace(publisherPrefix, "").trim();

  return withoutPublisherPrefix || normalized;
};
