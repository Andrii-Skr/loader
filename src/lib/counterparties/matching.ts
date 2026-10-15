import { normalizePartyName } from "@/lib/documents/party-name";
import { getStoredPartyTaxId } from "@/lib/documents/party-tax-id";
import type { DocumentContour, ParsedParty } from "@/lib/pdf/types";
import type { PartyOption } from "./schema";

export const partyNameKey = (name: string) =>
  normalizePartyName(name)
    .replace(/["«»„“”]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
export const isSyntheticTaxId = (value: string) => value.startsWith("name:");
export const sourceTaxId = (party: ParsedParty, contour: DocumentContour) =>
  party.taxId ? getStoredPartyTaxId({ contour, taxId: party.taxId, kpp: party.kpp }) : null;
export const hasTaxConflict = (source: string | null, target: string) =>
  Boolean(source && !isSyntheticTaxId(target) && source !== target);

/** Identifiers win; a name never overrides conflicting tax details. */
export const matchParty = ({
  party,
  contour,
  options,
  alias,
}: {
  party: ParsedParty;
  contour: DocumentContour;
  options: PartyOption[];
  alias?: PartyOption | null;
}): PartyOption | null => {
  const taxId = sourceTaxId(party, contour);
  if (taxId) {
    const exact = options.find((option) => option.taxId === taxId);
    if (exact) return exact;
    return null;
  }
  if (alias) return alias;
  const exact = options.filter((option) => partyNameKey(option.name) === partyNameKey(party.name));
  return exact.length === 1 ? exact[0] : null;
};
