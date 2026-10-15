import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isSyntheticTaxId, partyNameKey } from "./matching";
import type { DirectoryEntry, PartyRole } from "./schema";
import { PartyResolutionError, rememberPartyAlias } from "./service";

export const getCounterpartyDirectory = async (): Promise<DirectoryEntry[]> => {
  const [suppliers, recipients] = await Promise.all([
    prisma.supplier.findMany({
      include: { aliases: true, _count: { select: { documents: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.recipient.findMany({
      include: { aliases: true, _count: { select: { documents: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return [
    ...suppliers.map((party) => ({ ...party, role: "supplier" as const })),
    ...recipients.map((party) => ({ ...party, role: "recipient" as const })),
  ].map((party) => ({
    id: party.id,
    role: party.role,
    name: party.name,
    taxId: party.taxId,
    documentCount: party._count.documents,
    aliases: party.aliases.map((alias) => ({
      id: alias.id,
      name: alias.rawName,
      contour: alias.contour,
      scope: "sourceSupplierTaxId" in alias ? alias.sourceSupplierTaxId : "",
    })),
  }));
};

export const saveCanonicalParty = async (input: {
  role: PartyRole;
  id: number;
  name: string;
  taxId: string;
}) =>
  prisma.$transaction(async (db) => {
    if (!partyNameKey(input.name)) throw new PartyResolutionError("invalidInput");
    if (input.id) {
      const existing =
        input.role === "supplier"
          ? await db.supplier.findUniqueOrThrow({ where: { id: input.id } })
          : await db.recipient.findUniqueOrThrow({ where: { id: input.id } });
      const documents = await db.document.findMany({
        where: input.role === "supplier" ? { supplierId: input.id } : { recipientId: input.id },
        select: { documentContour: true },
        distinct: ["documentContour"],
      });
      const contours = documents.flatMap((doc) =>
        doc.documentContour ? [doc.documentContour] : [],
      );
      for (const contour of contours.length ? contours : ["UA" as const])
        await rememberPartyAlias(db, {
          role: input.role,
          id: input.id,
          contour,
          name: existing.name,
        });
      if (input.role === "supplier")
        await db.supplier.update({ where: { id: input.id }, data: { name: input.name } });
      else await db.recipient.update({ where: { id: input.id }, data: { name: input.name } });
    } else {
      const records =
        input.role === "supplier" ? await db.supplier.findMany() : await db.recipient.findMany();
      if (records.some((party) => partyNameKey(party.name) === partyNameKey(input.name)))
        throw new PartyResolutionError("duplicateName");
      const taxId =
        input.taxId ||
        `name:${createHash("sha256").update(partyNameKey(input.name)).digest("hex").slice(0, 24)}`;
      const data = { name: input.name, taxId };
      if (input.role === "supplier") await db.supplier.create({ data });
      else await db.recipient.create({ data });
    }
  });

export const mergeCanonicalParties = async (
  role: PartyRole,
  sourceId: number,
  targetId: number,
) => {
  if (sourceId === targetId) throw new PartyResolutionError("invalidInput");
  try {
    await prisma.$transaction(async (db) => {
      const source =
        role === "supplier"
          ? await db.supplier.findUniqueOrThrow({
              where: { id: sourceId },
              include: { aliases: true },
            })
          : await db.recipient.findUniqueOrThrow({
              where: { id: sourceId },
              include: { aliases: true },
            });
      const target =
        role === "supplier"
          ? await db.supplier.findUniqueOrThrow({ where: { id: targetId } })
          : await db.recipient.findUniqueOrThrow({ where: { id: targetId } });
      if (!isSyntheticTaxId(source.taxId) && source.taxId !== target.taxId)
        throw new PartyResolutionError("taxConflict");
      const documents = await db.document.findMany({
        where: role === "supplier" ? { supplierId: sourceId } : { recipientId: sourceId },
        select: { documentContour: true },
        distinct: ["documentContour"],
      });
      // Move aliases only if there is no conflicting target. Identical aliases deduplicate.
      for (const alias of source.aliases) {
        if (role === "supplier") {
          await db.supplierAlias.update({
            where: { id: alias.id },
            data: { supplierId: targetId },
          });
        } else {
          await db.recipientAlias.update({
            where: { id: alias.id },
            data: { recipientId: targetId },
          });
        }
      }
      for (const contour of documents.flatMap((d) =>
        d.documentContour ? [d.documentContour] : [],
      ))
        await rememberPartyAlias(db, { role, id: targetId, contour, name: source.name });
      if (role === "supplier") {
        // A version-key collision aborts the transaction instead of deleting documents.
        await db.document.updateMany({
          where: { supplierId: sourceId },
          data: { supplierId: targetId },
        });
        const scopes = await db.recipientAlias.findMany({
          where: { sourceSupplierTaxId: source.taxId },
        });
        for (const alias of scopes) {
          const key = {
            contour: alias.contour,
            normalizedName: alias.normalizedName,
            sourceSupplierTaxId: target.taxId,
          };
          const existing = await db.recipientAlias.findUnique({
            where: { contour_normalizedName_sourceSupplierTaxId: key },
          });
          if (existing && existing.recipientId !== alias.recipientId)
            throw new PartyResolutionError("aliasConflict");
          if (existing) await db.recipientAlias.delete({ where: { id: alias.id } });
          else
            await db.recipientAlias.update({
              where: { id: alias.id },
              data: { sourceSupplierTaxId: target.taxId },
            });
        }
        await db.supplier.delete({ where: { id: sourceId } });
      } else {
        await db.document.updateMany({
          where: { recipientId: sourceId },
          data: { recipientId: targetId },
        });
        await db.recipient.delete({ where: { id: sourceId } });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new PartyResolutionError("mergeConflict");
    throw error;
  }
};
