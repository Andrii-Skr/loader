"use server";

import { Prisma } from "@/generated/prisma/client";
import { mergeCanonicalParties, saveCanonicalParty } from "@/lib/counterparties/manage";
import { aliasSchema, managePartySchema, partyRoleSchema } from "@/lib/counterparties/schema";
import { PartyResolutionError, rememberPartyAlias } from "@/lib/counterparties/service";
import { prisma } from "@/lib/prisma";
import { appAction } from "@/utils/appAction";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const refresh = () => {
  for (const locale of ["ru", "uk", "en"]) revalidatePath(`/${locale}/dashboard`, "layout");
};
const errorResult = (error: unknown) => ({
  errorKey:
    error instanceof PartyResolutionError
      ? error.message
      : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "aliasConflict"
        : "saveFailed",
});
const options = {
  requireAuth: true,
  onUnauthorized: () => ({ errorKey: "missingSession" }),
  onInvalidInput: () => ({ errorKey: "invalidInput" }),
};

export const saveCounterparty = appAction(
  async (input: z.infer<ReturnType<typeof managePartySchema>>) => {
    try {
      await saveCanonicalParty(input);
      refresh();
      return { errorKey: null };
    } catch (error) {
      return errorResult(error);
    }
  },
  { ...options, schema: managePartySchema("invalidInput") },
);

export const addCounterpartyAlias = appAction(
  async (input: z.infer<ReturnType<typeof aliasSchema>>) => {
    try {
      await prisma.$transaction(async (db) => {
        if (input.role === "supplier")
          await db.supplier.findUniqueOrThrow({ where: { id: input.id } });
        else await db.recipient.findUniqueOrThrow({ where: { id: input.id } });
        if (input.sourceSupplierTaxId)
          await db.supplier.findUniqueOrThrow({ where: { taxId: input.sourceSupplierTaxId } });
        await rememberPartyAlias(db, input);
      });
      refresh();
      return { errorKey: null };
    } catch (error) {
      return errorResult(error);
    }
  },
  { ...options, schema: aliasSchema("invalidInput") },
);

export const removeCounterpartyAlias = appAction(
  async (input: { role: "supplier" | "recipient"; id: number }) => {
    try {
      if (input.role === "supplier") await prisma.supplierAlias.delete({ where: { id: input.id } });
      else await prisma.recipientAlias.delete({ where: { id: input.id } });
      refresh();
      return { errorKey: null };
    } catch (error) {
      return errorResult(error);
    }
  },
  { ...options, schema: z.object({ role: partyRoleSchema, id: z.number().int().positive() }) },
);

export const mergeCounterparties = appAction(
  async (input: { role: "supplier" | "recipient"; sourceId: number; targetId: number }) => {
    try {
      await mergeCanonicalParties(input.role, input.sourceId, input.targetId);
      refresh();
      return { errorKey: null };
    } catch (error) {
      return errorResult(error);
    }
  },
  {
    ...options,
    schema: z.object({
      role: partyRoleSchema,
      sourceId: z.number().int().positive(),
      targetId: z.number().int().positive(),
    }),
  },
);
