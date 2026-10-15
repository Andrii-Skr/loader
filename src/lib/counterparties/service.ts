import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { normalizePartyName } from "@/lib/documents/party-name";
import type { DocumentContour, ParsedParty, ParsedVatInvoice } from "@/lib/pdf/types";
import { prisma } from "@/lib/prisma";
import { scoreTextSimilarity } from "@/lib/publication-mappings/matching";
import {
  hasTaxConflict,
  isSyntheticTaxId,
  matchParty,
  partyNameKey,
  sourceTaxId,
} from "./matching";
import type { PartyChoice, PartyChoices, PartyOption, PartyQuestion, PartyRole } from "./schema";

type Db = Prisma.TransactionClient;
export class PartyResolutionError extends Error {}
export type ResolvedParties = { supplier: PartyOption; recipient: PartyOption };
export class PartySelectionRequired extends Error {
  constructor(public readonly questions: PartyQuestion[]) {
    super("partySelectionRequired");
  }
}
const taxForNewParty = (party: ParsedParty, contour: DocumentContour, name: string) =>
  sourceTaxId(party, contour) ??
  `name:${createHash("sha256").update(partyNameKey(name)).digest("hex").slice(0, 24)}`;

export const rememberPartyAlias = async (
  db: Db,
  input: {
    role: PartyRole;
    id: number;
    contour: DocumentContour;
    name: string;
    sourceSupplierTaxId?: string;
  },
) => {
  const normalizedName = partyNameKey(input.name);
  if (!normalizedName) throw new PartyResolutionError("invalidInput");
  if (input.role === "supplier") {
    const where = { contour_normalizedName: { contour: input.contour, normalizedName } };
    const existing = await db.supplierAlias.findUnique({ where });
    if (existing && existing.supplierId !== input.id)
      throw new PartyResolutionError("aliasConflict");
    const saved = await db.supplierAlias.upsert({
      where,
      update: {},
      create: {
        contour: input.contour,
        normalizedName,
        rawName: input.name,
        supplierId: input.id,
      },
    });
    if (saved.supplierId !== input.id) throw new PartyResolutionError("aliasConflict");
  } else {
    const scope = input.sourceSupplierTaxId ?? "";
    const where = {
      contour_normalizedName_sourceSupplierTaxId: {
        contour: input.contour,
        normalizedName,
        sourceSupplierTaxId: scope,
      },
    };
    const existing = await db.recipientAlias.findUnique({ where });
    if (existing && existing.recipientId !== input.id)
      throw new PartyResolutionError("aliasConflict");
    const saved = await db.recipientAlias.upsert({
      where,
      update: {},
      create: {
        contour: input.contour,
        normalizedName,
        rawName: input.name,
        sourceSupplierTaxId: scope,
        recipientId: input.id,
      },
    });
    if (saved.recipientId !== input.id) throw new PartyResolutionError("aliasConflict");
  }
};

const inspectParty = async (
  db: Db,
  role: PartyRole,
  party: ParsedParty,
  contour: DocumentContour,
  supplierTaxId = "",
) => {
  const options: PartyOption[] =
    role === "supplier"
      ? await db.supplier.findMany({
          select: { id: true, name: true, taxId: true },
          orderBy: { name: "asc" },
        })
      : await db.recipient.findMany({
          select: { id: true, name: true, taxId: true },
          orderBy: { name: "asc" },
        });
  const normalizedName = partyNameKey(party.name);
  let alias: PartyOption | null = null;
  if (role === "supplier") {
    const row = await db.supplierAlias.findUnique({
      where: { contour_normalizedName: { contour, normalizedName } },
      include: { supplier: true },
    });
    alias = row?.supplier ?? null;
  } else {
    const scoped = await db.recipientAlias.findUnique({
      where: {
        contour_normalizedName_sourceSupplierTaxId: {
          contour,
          normalizedName,
          sourceSupplierTaxId: supplierTaxId,
        },
      },
      include: { recipient: true },
    });
    const global =
      scoped ??
      (supplierTaxId
        ? await db.recipientAlias.findUnique({
            where: {
              contour_normalizedName_sourceSupplierTaxId: {
                contour,
                normalizedName,
                sourceSupplierTaxId: "",
              },
            },
            include: { recipient: true },
          })
        : null);
    alias = global?.recipient ?? null;
  }
  const matched = matchParty({ party, contour, options, alias });
  const taxId = sourceTaxId(party, contour);
  const candidates = options
    .filter((option) => !hasTaxConflict(taxId, option.taxId))
    .sort(
      (a, b) =>
        scoreTextSimilarity(partyNameKey(party.name), partyNameKey(b.name)) -
        scoreTextSimilarity(partyNameKey(party.name), partyNameKey(a.name)),
    );
  return {
    matched,
    question: {
      role,
      sourceName: party.name,
      sourceTaxId: taxId,
      suggestedName: normalizePartyName(party.name),
      options: candidates,
    } satisfies PartyQuestion,
  };
};

const chooseParty = async (
  db: Db,
  role: PartyRole,
  party: ParsedParty,
  contour: DocumentContour,
  choice: PartyChoice | undefined,
  supplierTaxId: string,
): Promise<PartyOption> => {
  if (!choice) throw new PartyResolutionError("invalidInput");
  let selected: PartyOption | null;
  if (choice.mode === "existing") {
    selected =
      role === "supplier"
        ? await db.supplier.findUnique({ where: { id: choice.id } })
        : await db.recipient.findUnique({ where: { id: choice.id } });
    if (!selected || hasTaxConflict(sourceTaxId(party, contour), selected.taxId))
      throw new PartyResolutionError("taxConflict");
    const incomingTaxId = sourceTaxId(party, contour);
    if (incomingTaxId && isSyntheticTaxId(selected.taxId)) {
      const oldTaxId = selected.taxId;
      const data = { taxId: incomingTaxId, kpp: party.kpp };
      selected =
        role === "supplier"
          ? await db.supplier.update({ where: { id: selected.id }, data })
          : await db.recipient.update({ where: { id: selected.id }, data });
      if (role === "supplier") {
        const scopes = await db.recipientAlias.findMany({
          where: { sourceSupplierTaxId: oldTaxId },
        });
        for (const alias of scopes) {
          await rememberPartyAlias(db, {
            role: "recipient",
            id: alias.recipientId,
            contour: alias.contour,
            name: alias.rawName,
            sourceSupplierTaxId: incomingTaxId,
          });
          await db.recipientAlias.delete({ where: { id: alias.id } });
        }
      }
    }
  } else {
    const existingNames =
      role === "supplier" ? await db.supplier.findMany() : await db.recipient.findMany();
    if (
      existingNames.some(
        (option) =>
          partyNameKey(option.name) === partyNameKey(choice.name) &&
          !hasTaxConflict(sourceTaxId(party, contour), option.taxId),
      )
    )
      throw new PartyResolutionError("duplicateName");
    const taxId = taxForNewParty(party, contour, choice.name);
    const data = { name: choice.name, taxId, kpp: party.kpp };
    // A concurrent confirmation may already have created the same identity.
    selected =
      role === "supplier"
        ? await db.supplier.upsert({ where: { taxId }, update: {}, create: data })
        : await db.recipient.upsert({ where: { taxId }, update: {}, create: data });
  }
  await rememberPartyAlias(db, {
    role,
    id: selected.id,
    contour,
    name: party.name,
    sourceSupplierTaxId: supplierTaxId,
  });
  return selected;
};

/** Resolves both roles before creating anything. Confirmation and aliases commit together. */
export const resolveCounterparties = async (
  parsed: ParsedVatInvoice,
  contour: DocumentContour,
  choices: PartyChoices = {},
): Promise<ResolvedParties> =>
  prisma
    .$transaction(async (db) => {
      const supplierState = await inspectParty(db, "supplier", parsed.supplier, contour);
      const supplierScope =
        supplierState.matched?.taxId ?? sourceTaxId(parsed.supplier, contour) ?? "";
      const recipientState = await inspectParty(
        db,
        "recipient",
        parsed.recipient,
        contour,
        supplierScope,
      );
      const questions: PartyQuestion[] = [];
      if (!supplierState.matched && !choices.supplier) questions.push(supplierState.question);
      if (!recipientState.matched && !choices.recipient) questions.push(recipientState.question);
      if (questions.length) throw new PartySelectionRequired(questions);
      const supplier =
        supplierState.matched ??
        (await chooseParty(db, "supplier", parsed.supplier, contour, choices.supplier, ""));
      // A selected supplier can supply a more specific alias than the initial inspection.
      const recipientAfterSupplier =
        supplier.taxId === supplierScope
          ? recipientState
          : await inspectParty(db, "recipient", parsed.recipient, contour, supplier.taxId);
      if (!recipientAfterSupplier.matched && !choices.recipient)
        throw new PartySelectionRequired([recipientAfterSupplier.question]);
      const recipient =
        recipientAfterSupplier.matched ??
        (await chooseParty(
          db,
          "recipient",
          parsed.recipient,
          contour,
          choices.recipient,
          supplier.taxId,
        ));
      return { supplier, recipient };
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new PartyResolutionError("aliasConflict");
      throw error;
    });
