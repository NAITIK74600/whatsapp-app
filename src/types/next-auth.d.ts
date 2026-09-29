import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      role: string;
      id: string;
      mustChangePassword?: boolean;
    } & DefaultSession["user"]
  }

  interface User {
      role: string;
      id: string;
      mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
    interface JWT {
        role: string;
        id: string;
        mustChangePassword?: boolean;
    }
}

