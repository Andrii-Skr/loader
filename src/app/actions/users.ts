"use server";

import { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { type CreateUserInput, createUserInputSchema } from "@/lib/auth/user-creation";
import { prisma } from "@/lib/prisma";
import { appAction } from "@/utils/appAction";

export type CreateUserActionResult = {
  errorKey: "duplicateLogin" | "forbidden" | "invalidInput" | "missingSession" | null;
};

const createUserSchema = createUserInputSchema({
  name: "invalid",
  login: "invalid",
  password: "invalid",
  passwordConfirmation: "invalid",
});

export const createUser = appAction<
  CreateUserInput,
  ReturnType<typeof createUserSchema.parse>,
  CreateUserActionResult
>(
  async ({ login, name, password, role }) => {
    const passwordHash = await hashPassword(password);

    try {
      await prisma.user.create({
        data: {
          login,
          name,
          passwordHash,
          role,
        },
        select: {
          id: true,
        },
      });

      return { errorKey: null };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { errorKey: "duplicateLogin" };
      }

      throw error;
    }
  },
  {
    schema: createUserSchema,
    roles: ["ADMIN"],
    onForbidden: () => ({ errorKey: "forbidden" }),
    onInvalidInput: () => ({ errorKey: "invalidInput" }),
    onUnauthorized: () => ({ errorKey: "missingSession" }),
  },
);
