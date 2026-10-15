import { z } from "zod";

export const partyRoleSchema = z.enum(["supplier", "recipient"]);
export type PartyRole = z.infer<typeof partyRoleSchema>;
export const partyChoiceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), id: z.number().int().positive() }),
  z.object({ mode: z.literal("create"), name: z.string().trim().min(1).max(300) }),
]);
export const partyChoicesSchema = z.object({
  supplier: partyChoiceSchema.optional(),
  recipient: partyChoiceSchema.optional(),
});
export type PartyChoices = z.infer<typeof partyChoicesSchema>;
export type PartyChoice = z.infer<typeof partyChoiceSchema>;
export type PartyOption = { id: number; name: string; taxId: string };
export type PartyQuestion = {
  role: PartyRole;
  sourceName: string;
  sourceTaxId: string | null;
  suggestedName: string;
  options: PartyOption[];
};
export type PartySelection = { questions: PartyQuestion[] };
export type DirectoryEntry = PartyOption & {
  role: PartyRole;
  documentCount: number;
  aliases: Array<{ id: number; name: string; contour: "UA" | "RU"; scope: string }>;
};

export const managePartySchema = (message: string) =>
  z.object({
    role: partyRoleSchema,
    id: z.coerce.number().int().nonnegative(),
    name: z.string().trim().min(1, message).max(300, message),
    taxId: z.string().trim().max(100, message),
  });
export const aliasSchema = (message: string) =>
  z.object({
    role: partyRoleSchema,
    id: z.coerce.number().int().positive(),
    contour: z.enum(["UA", "RU"]),
    name: z.string().trim().min(1, message).max(300, message),
    sourceSupplierTaxId: z.string().trim().max(100, message),
  });

export const partySelectionFormSchema = (questions: PartyQuestion[], message: string) =>
  z
    .object({
      supplierSelection: z.string(),
      supplierName: z.string().trim().max(300, message),
      recipientSelection: z.string(),
      recipientName: z.string().trim().max(300, message),
    })
    .superRefine((value, ctx) => {
      for (const question of questions) {
        const selection = value[`${question.role}Selection`];
        if (!selection)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [`${question.role}Selection`],
            message,
          });
        if (selection === "create" && !value[`${question.role}Name`])
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`${question.role}Name`], message });
      }
    });

export const directoryFormSchema = (message: string) =>
  z
    .object({
      operation: z.enum(["save", "alias", "merge"]),
      role: partyRoleSchema,
      id: z.number().int().nonnegative(),
      name: z.string().trim().max(300, message),
      taxId: z.string().trim().max(100, message),
      contour: z.enum(["UA", "RU"]),
      sourceSupplierTaxId: z.string(),
      targetId: z.string(),
    })
    .superRefine((value, ctx) => {
      if (value.operation !== "merge" && !value.name)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message });
      if (value.operation === "merge" && !/^[1-9]\d*$/u.test(value.targetId))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetId"], message });
    });
