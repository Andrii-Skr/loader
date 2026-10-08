import { z } from "zod";

// Matches Decimal(15, 3); more precision would alter the allocation on persistence.
export const quantitySchema = (message: string) =>
  z
    .string()
    .trim()
    .regex(/^(?:\d{1,12}(?:\.\d{0,3})?|\.\d{1,3})$/, message);
