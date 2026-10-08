import { describe, expect, it } from "vitest";
import { formatUnitPrice, unitPriceSchema } from "./price";

describe("unitPriceSchema", () => {
  it.each([
    ["0", "0.00"],
    ["12", "12.00"],
    ["12.3", "12.30"],
    [".5", "0.50"],
    ["12.34", "12.34"],
    ["9999999999999.99", "9999999999999.99"],
  ])("formats %s with exactly two decimal places", (input, expected) => {
    expect(unitPriceSchema("Invalid price").parse(input)).toBe(expected);
    expect(formatUnitPrice(input)).toBe(expected);
  });

  it.each(["12.345", "0.005", "-1", "NaN", "Infinity", "1e2", "", "10000000000000"])(
    "rejects %s rather than letting the database round or overflow it",
    (input) => {
      const result = unitPriceSchema("Invalid price").safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe("Invalid price");
      expect(formatUnitPrice(input)).toBe(input);
    },
  );
});
