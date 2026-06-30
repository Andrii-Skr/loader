import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import { abortAction, appAction, appFormDataAction } from "@/utils/appAction";

describe("appAction", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
  });

  it("passes parsed input into the handler", async () => {
    const action = appAction<
      { value: string },
      { value: string },
      { errorKey: null; value: string }
    >(
      async (input: { value: string }) => ({
        errorKey: null,
        value: input.value,
      }),
      {
        schema: z.object({
          value: z.string().min(1),
        }),
      },
    );

    await expect(action({ value: "ok" })).resolves.toEqual({
      errorKey: null,
      value: "ok",
    });
  });

  it("returns the invalid-input fallback on schema failure", async () => {
    const action = appAction<
      { value: string },
      { value: string },
      { errorKey: "invalidInput" | null }
    >(
      async (_input: { value: string }) => ({
        errorKey: null,
      }),
      {
        schema: z.object({
          value: z.string().min(2),
        }),
        onInvalidInput: () => ({
          errorKey: "invalidInput",
        }),
      },
    );

    await expect(action({ value: "" })).resolves.toEqual({
      errorKey: "invalidInput",
    });
  });

  it("returns the unauthorized fallback when auth is required", async () => {
    const action = appAction<
      { value: string },
      { value: string },
      { errorKey: "missingSession" | null; value?: string }
    >(
      async (input: { value: string }) => ({
        errorKey: null,
        value: input.value,
      }),
      {
        requireAuth: true,
        onUnauthorized: () => ({
          errorKey: "missingSession",
        }),
      },
    );

    await expect(action({ value: "ok" })).resolves.toEqual({
      errorKey: "missingSession",
    });
  });

  it("returns the forbidden fallback when the role does not match", async () => {
    authMock.mockResolvedValue({
      user: {
        id: 1,
        role: "OPERATOR",
      },
    });

    const action = appAction<
      { value: string },
      { value: string },
      { errorKey: "forbidden" | null; value?: string }
    >(
      async (input: { value: string }) => ({
        errorKey: null,
        value: input.value,
      }),
      {
        roles: ["ADMIN"],
        onForbidden: () => ({
          errorKey: "forbidden",
        }),
      },
    );

    await expect(action({ value: "ok" })).resolves.toEqual({
      errorKey: "forbidden",
    });
  });

  it("prepares and validates FormData input", async () => {
    authMock.mockResolvedValue({
      user: {
        id: 1,
        role: "ADMIN",
      },
    });

    const action = appFormDataAction<
      { value: string },
      { value: string },
      { errorKey: null; value: string }
    >(
      async (input) => ({
        errorKey: null,
        value: input.value,
      }),
      {
        requireAuth: true,
        prepareInput: (formData) => ({
          ok: true,
          value: {
            value: String(formData.get("value") ?? ""),
          },
        }),
        schema: z.object({
          value: z.string().min(1),
        }),
      },
    );

    const formData = new FormData();
    formData.set("value", "ok");

    await expect(action(formData)).resolves.toEqual({
      errorKey: null,
      value: "ok",
    });
  });

  it("allows FormData preparation to stop early with a domain result", async () => {
    const action = appFormDataAction<
      { value: string },
      { value: string },
      { errorKey: "missingValue" | null }
    >(
      async () => ({
        errorKey: null,
      }),
      {
        prepareInput: (formData) => {
          const value = String(formData.get("value") ?? "");

          if (value.length === 0) {
            return abortAction({
              errorKey: "missingValue",
            });
          }

          return {
            ok: true,
            value: {
              value,
            },
          };
        },
      },
    );

    await expect(action(new FormData())).resolves.toEqual({
      errorKey: "missingValue",
    });
  });
});
