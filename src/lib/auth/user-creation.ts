import { z } from "zod";

import { passwordSchema } from "@/lib/auth/password-policy";

export const userRoles = ["OPERATOR", "ADMIN"] as const;

export type CreatableUserRole = (typeof userRoles)[number];

export type CreateUserInput = {
  name: string;
  login: string;
  password: string;
  passwordConfirmation: string;
  role: CreatableUserRole;
};

type CreateUserValidationMessages = {
  name: string;
  login: string;
  password: string;
  passwordConfirmation: string;
};

export const createUserInputSchema = (messages: CreateUserValidationMessages) =>
  z
    .object({
      name: z.string().trim().min(1, messages.name).max(100, messages.name),
      login: z.string().trim().min(3, messages.login).max(64, messages.login),
      password: passwordSchema(messages.password),
      passwordConfirmation: passwordSchema(messages.password),
      role: z.enum(userRoles),
    })
    .refine(({ password, passwordConfirmation }) => password === passwordConfirmation, {
      message: messages.passwordConfirmation,
      path: ["passwordConfirmation"],
    });
