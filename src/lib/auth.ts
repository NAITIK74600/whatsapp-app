import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";

const cleanEnvValue = (value?: string) =>
  value?.trim().replace(/^(['"])(.*)\1$/, "$2");

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { password } = parsedCredentials.data;
          const email = parsedCredentials.data.email.trim().replace(/^(['"])(.*)\1$/, "$2").toLowerCase();
          
          let user = await prisma.user.findUnique({ where: { email } });
          const adminEmail = cleanEnvValue(process.env.ADMIN_EMAIL)?.toLowerCase();
          const adminPassword = cleanEnvValue(process.env.ADMIN_PASSWORD);
          const isConfiguredAdmin = email === adminEmail && password === adminPassword;

          if (isConfiguredAdmin) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user = await prisma.user.upsert({
              where: { email },
              update: { password: hashedPassword, role: "SUPERADMIN" },
              create: {
                email,
                name: "Super Admin",
                password: hashedPassword,
                role: "SUPERADMIN",
              },
            });
          }

          if (!user) return null;
          if (isConfiguredAdmin || await bcrypt.compare(password, user.password)) return user;
        }
        return null;
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
});
