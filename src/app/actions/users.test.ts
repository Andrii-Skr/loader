import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";

const authMock = vi.hoisted(() => vi.fn());
const userCreateMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      create: userCreateMock,
    },
  },
}));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
}));

import { createUser } from "@/app/actions/users";

const validInput = {
  name: "New User",
  login: "new-user",
  password: "password-123",
  passwordConfirmation: "password-123",
  role: "OPERATOR" as const,
};

describe("createUser", () => {
  beforeEach(() => {
    authMock.mockReset();
    userCreateMock.mockReset();
    hashPasswordMock.mockReset();
    authMock.mockResolvedValue({ user: { id: 1, role: "ADMIN" } });
    hashPasswordMock.mockResolvedValue("hashed-password");
    userCreateMock.mockResolvedValue({ id: 2 });
  });

  it.each(["OPERATOR", "ADMIN"] as const)("creates a user with the %s role", async (role) => {
    await expect(createUser({ ...validInput, role })).resolves.toEqual({ errorKey: null });

    expect(hashPasswordMock).toHaveBeenCalledWith(validInput.password);
    expect(userCreateMock).toHaveBeenCalledWith({
      data: {
        login: validInput.login,
        name: validInput.name,
        passwordHash: "hashed-password",
        role,
      },
      select: {
        id: true,
      },
    });
  });

  it("normalizes the name and login before creating the user", async () => {
    await createUser({
      ...validInput,
      login: "  normalized-login  ",
      name: "  Normalized Name  ",
    });

    expect(userCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          login: "normalized-login",
          name: "Normalized Name",
        }),
      }),
    );
  });

  it("returns a duplicate-login error for a unique constraint violation", async () => {
    userCreateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.7.0",
      }),
    );

    await expect(createUser(validInput)).resolves.toEqual({ errorKey: "duplicateLogin" });
  });

  it("rejects mismatched passwords before hashing", async () => {
    await expect(
      createUser({ ...validInput, passwordConfirmation: "different-password" }),
    ).resolves.toEqual({ errorKey: "invalidInput" });

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a password longer than 16 characters before hashing", async () => {
    const password = "a".repeat(17);

    await expect(
      createUser({
        ...validInput,
        password,
        passwordConfirmation: password,
      }),
    ).resolves.toEqual({ errorKey: "invalidInput" });

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported role before hashing", async () => {
    await expect(createUser({ ...validInput, role: "OWNER" as never })).resolves.toEqual({
      errorKey: "invalidInput",
    });

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a missing session", async () => {
    authMock.mockResolvedValue(null);

    await expect(createUser(validInput)).resolves.toEqual({ errorKey: "missingSession" });
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("rejects an operator session", async () => {
    authMock.mockResolvedValue({ user: { id: 1, role: "OPERATOR" } });

    await expect(createUser(validInput)).resolves.toEqual({ errorKey: "forbidden" });
    expect(userCreateMock).not.toHaveBeenCalled();
  });
});
