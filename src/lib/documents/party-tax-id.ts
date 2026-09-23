import { createHash } from "node:crypto";

import { normalizePartyName } from "@/lib/documents/party-name";
import type { DocumentContour } from "@/lib/pdf/types";

export const getStoredPartyTaxId = ({
  contour,
  taxId,
  kpp,
}: {
  contour: DocumentContour;
  taxId: string;
  kpp: string | null;
}) => {
  if (contour === "RU" && kpp) {
    return `${taxId}/${kpp}`;
  }

  return taxId;
};

export const resolvePartyTaxId = async ({
  party,
  contour,
  findExistingTaxIds,
}: {
  party: { name: string; taxId: string | null; kpp: string | null };
  contour: DocumentContour;
  findExistingTaxIds: (name: string) => Promise<Array<{ taxId: string }>>;
}) => {
  if (party.taxId) {
    return getStoredPartyTaxId({ contour, taxId: party.taxId, kpp: party.kpp });
  }

  const normalizedName = normalizePartyName(party.name);
  const existing = await findExistingTaxIds(normalizedName);

  return (
    (existing.length === 1 ? existing[0]?.taxId : null) ??
    `name:${createHash("sha256").update(normalizedName.toLocaleLowerCase("uk-UA")).digest("hex").slice(0, 24)}`
  );
};
