import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  login: z.string().min(3).max(64),
  password: z.string().min(8),
});

const parseNumericId = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { login: parsed.data.login },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await verifyPassword(parsed.data.password, user.passwordHash);

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          login: user.login,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        const userId = parseNumericId(user.id);

        if (userId === null) {
          return {};
        }

        token.id = userId;
        token.sub = String(userId);
        token.login = user.login;
        token.role = user.role;
        return token;
      }

      const tokenId = parseNumericId(token.id ?? token.sub);

      if (tokenId === null) {
        return {};
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: tokenId },
        select: {
          login: true,
          role: true,
        },
      });

      if (!existingUser) {
        return {};
      }

      token.login = existingUser.login;
      token.role = existingUser.role;
      token.id = tokenId;
      token.sub = String(tokenId);
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        const sessionUserId = parseNumericId(token.id ?? token.sub);

        if (sessionUserId === null) {
          return null as never;
        }

        session.user = {
          ...session.user,
          id: sessionUserId,
          login: String(token.login),
          role: token.role ?? "OPERATOR",
        } as typeof session.user;
      }

      return session;
    },
  },
});
