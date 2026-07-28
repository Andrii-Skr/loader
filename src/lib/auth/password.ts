import bcrypt from "bcryptjs";

import { passwordSchema } from "@/lib/auth/password-policy";

const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(passwordSchema().parse(password), SALT_ROUNDS);

export const verifyPassword = async (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);
