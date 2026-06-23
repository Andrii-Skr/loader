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
