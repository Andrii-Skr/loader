import { expect, it } from "vitest";
import { quantitySchema } from "./quantity";
it.each(["0.1005", "0.8995", "1000000000000", "1e3", "-1", "NaN"])(
  "rejects unrepresentable quantity %s",
  (value) => {
    expect(quantitySchema("Invalid quantity").safeParse(value).success).toBe(false);
  },
);
it.each(["1", "0.001", ".125", "999999999999.999"])("accepts quantity %s", (value) => {
  expect(quantitySchema("Invalid quantity").safeParse(value).success).toBe(true);
});
