import { describe, expect, it } from "vitest";

import { passwordSchema } from "@/lib/auth/password-policy";

describe("passwordSchema", () => {
  it.each(["a".repeat(8), "a".repeat(16), "🔐".repeat(8), "🔐".repeat(16)])(
    "accepts a password within the 8–16 character range",
    (password) => {
      expect(passwordSchema().safeParse(password).success).toBe(true);
    },
  );

  it.each(["a".repeat(7), "a".repeat(17), "🔐".repeat(7), "🔐".repeat(17)])(
    "rejects a password outside the 8–16 character range",
    (password) => {
      expect(passwordSchema().safeParse(password).success).toBe(false);
    },
  );
});
