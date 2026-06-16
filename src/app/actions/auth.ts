"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "@/auth";
import type { AppLocale } from "@/i18n/routing";

const loginSchema = z.object({
  login: z.string().min(3).max(64),
  password: z.string().min(8),
});

export type LoginActionResult = {
  errorKey: "invalidCredentials" | "invalidInput" | null;
};

export const loginWithCredentials = async (
  locale: AppLocale,
  values: z.infer<typeof loginSchema>,
): Promise<LoginActionResult> => {
  const parsed = loginSchema.safeParse(values);

  if (!parsed.success) {
    return {
      errorKey: "invalidInput",
    };
  }

  try {
    await signIn("credentials", {
      login: parsed.data.login,
      password: parsed.data.password,
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
};
