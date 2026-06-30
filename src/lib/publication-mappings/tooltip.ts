import type { PublicationIssueDocumentOccurrence } from "@/lib/publication-mappings/types";

export const getOccurrenceRawText = (occurrence: PublicationIssueDocumentOccurrence) =>
  occurrence.description.trim() || occurrence.rawRowText?.trim() || "";

export const getOccurrenceDocumentLabel = (occurrence: PublicationIssueDocumentOccurrence) =>
  occurrence.documentNumber?.trim() || occurrence.sourceFileName;
