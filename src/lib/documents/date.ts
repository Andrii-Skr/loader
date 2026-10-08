import { z } from "zod";

const toUtcDate = (value: string): Date => {
  const [day, month, year] = value.split(".").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
};

const documentDateSchema = z
  .string()
  .regex(/^\d{2}\.\d{2}\.\d{4}$/)
  .refine((value) => {
    const [day, month, year] = value.split(".").map(Number);
    const date = toUtcDate(value);
    return (
      year >= 1 &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });

export class InvalidDocumentDateError extends Error {
  constructor() {
    super("invalidDocumentDate");
    this.name = "InvalidDocumentDateError";
  }
}

export const parseDocumentDate = (value: string): Date => {
  const parsed = documentDateSchema.safeParse(value);
  if (!parsed.success) throw new InvalidDocumentDateError();
  return toUtcDate(parsed.data);
};

export const validateDocumentDate = (value: string): string => {
  parseDocumentDate(value);
  return value;
};
