import { detectAndParseDocument } from "@/lib/pdf/parser";
import { prisma } from "@/lib/prisma";
import { mergeCanonicalParties } from "./manage";
import { hasTaxConflict, isSyntheticTaxId, partyNameKey, sourceTaxId } from "./matching";
import type { PartyRole } from "./schema";
import { PartyResolutionError, rememberPartyAlias } from "./service";

/** Exact normalized names only. Never infer identity from fuzzy similarity. */
export const backfillCounterpartyAliases = async (apply = false) => {
  const report: {
    merged: Array<{ role: PartyRole; sourceId: number; targetId: number }>;
    skipped: string[];
    aliases: number;
  } = { merged: [], skipped: [], aliases: 0 };
  for (const role of ["supplier", "recipient"] as const) {
    const records =
      role === "supplier"
        ? await prisma.supplier.findMany({ include: { _count: { select: { documents: true } } } })
        : await prisma.recipient.findMany({ include: { _count: { select: { documents: true } } } });
    const groups = new Map<string, typeof records>();
    for (const party of records) {
      const key = partyNameKey(party.name);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), party]);
    }
    for (const group of groups.values()) {
      group.sort(
        (a, b) =>
          Number(isSyntheticTaxId(a.taxId)) - Number(isSyntheticTaxId(b.taxId)) ||
          b._count.documents - a._count.documents ||
          a.id - b.id,
      );
      const target = group[0];
      if (!target) continue;
      for (const source of group.slice(1)) {
        if (!isSyntheticTaxId(source.taxId)) {
          report.skipped.push(`${role}:${source.id}:taxConflict`);
          continue;
        }
        if (apply) {
          try {
            await mergeCanonicalParties(role, source.id, target.id);
          } catch (error) {
            report.skipped.push(
              `${role}:${source.id}:${error instanceof Error ? error.message : "failed"}`,
            );
            continue;
          }
        }
        report.merged.push({ role, sourceId: source.id, targetId: target.id });
      }
    }
  }
  const documents = await prisma.document.findMany({
    where: { rawText: { not: null }, documentContour: { not: null } },
    include: { supplier: true, recipient: true },
  });
  for (const document of documents) {
    if (!document.rawText || !document.documentContour) continue;
    let parsed: ReturnType<typeof detectAndParseDocument>["parsed"];
    try {
      parsed = detectAndParseDocument(document.rawText).parsed;
    } catch {
      continue;
    }
    for (const role of ["supplier", "recipient"] as const) {
      const target = document[role];
      if (
        !target ||
        hasTaxConflict(sourceTaxId(parsed[role], document.documentContour), target.taxId)
      )
        continue;
      const input = {
        role,
        id: target.id,
        contour: document.documentContour,
        name: parsed[role].name,
        sourceSupplierTaxId: role === "recipient" ? (document.supplier?.taxId ?? "") : "",
      };
      if (apply) {
        try {
          await prisma.$transaction((db) => rememberPartyAlias(db, input));
        } catch (error) {
          if (error instanceof PartyResolutionError) {
            report.skipped.push(`${role}:${target.id}:${error.message}`);
            continue;
          }
          throw error;
        }
      }
      report.aliases++;
    }
  }
  return report;
};
