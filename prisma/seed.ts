import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { UserRole } from "../src/generated/prisma/client";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

loadEnv({ path: ".env.local" });
loadEnv();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});

const prisma = new PrismaClient({ adapter });

const getRequiredEnv = (key: "ADMIN_LOGIN" | "ADMIN_PASSWORD") => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

async function main() {
  const login = getRequiredEnv("ADMIN_LOGIN");
  const password = getRequiredEnv("ADMIN_PASSWORD");
  const name = process.env.ADMIN_NAME?.trim() || "Admin";
  const email = process.env.ADMIN_EMAIL?.trim() || `${login}@zenit.local`;
  const passwordHash = await hashPassword(password);

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ login }, { email }],
    },
  });

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          login,
          email,
          name,
          role: UserRole.ADMIN,
          passwordHash,
        },
      })
    : await prisma.user.create({
        data: {
          login,
          email,
          name,
          role: UserRole.ADMIN,
          passwordHash,
        },
      });

  console.log(`Seeded admin user: ${user.login}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
