import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 16;

const getPasswordLength = (password: string) => Array.from(password).length;

export const passwordSchema = (message = "invalid") =>
  z.string().refine(
    (password) => {
      const length = getPasswordLength(password);

      return length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH;
    },
    { message },
  );
