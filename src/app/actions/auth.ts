"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "@/auth";
import type { AppLocale } from "@/i18n/routing";
import { passwordSchema } from "@/lib/auth/password-policy";
import { appAction } from "@/utils/appAction";

const loginSchema = z.object({
  login: z.string().min(3).max(64),
  password: passwordSchema(),
});

export type LoginActionResult = {
  errorKey: "invalidCredentials" | "invalidInput" | null;
};

export const loginWithCredentials = async (
  locale: AppLocale,
  values: z.infer<typeof loginSchema>,
): Promise<LoginActionResult> =>
  appAction<z.input<typeof loginSchema>, z.infer<typeof loginSchema>, LoginActionResult>(
    async (parsedValues) => {
      try {
        await signIn("credentials", {
          login: parsedValues.login,
          password: parsedValues.password,
          redirectTo: `/${locale}/dashboard`,
        });

        return { errorKey: null };
      } catch (error) {
        if (error instanceof AuthError) {
          return {
            errorKey: "invalidCredentials",
          };
        }

        throw error;
      }
    },
    {
      schema: loginSchema,
      onInvalidInput: () => ({
        errorKey: "invalidInput",
      }),
    },
  )(values);
