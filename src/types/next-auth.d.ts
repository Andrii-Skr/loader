import type { UserRole } from "@/generated/prisma/client";
import type { DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      login: string;
      role: UserRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User extends Omit<DefaultUser, "id"> {
    id: number;
    login: string;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: number;
    login?: string;
    role?: UserRole;
  }
}
