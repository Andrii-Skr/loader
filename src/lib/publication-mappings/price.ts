import { z } from "zod";

// Matches the database's Decimal(15, 2), without rounding a user's price.
export const unitPriceSchema = (message: string) =>
  z
    .string()
    .trim()
    .regex(/^(?:\d{1,13}(?:\.\d{0,2})?|\.\d{1,2})$/, message)
    .transform((value) => {
      const [integer, fraction = ""] = value.split(".");
      return `${integer || "0"}.${fraction.padEnd(2, "0")}`;
    });

export const formatUnitPrice = (value: string): string => {
  const result = unitPriceSchema("invalid").safeParse(value);
  return result.success ? result.data : value;
};
