import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const cleanEnvValue = (value?: string) =>
    value?.trim().replace(/^(['"])(.*)\1$/, "$2");

export async function ensureAdminFromEnv() {
    const email = cleanEnvValue(process.env.ADMIN_EMAIL)?.toLowerCase();
    const password = cleanEnvValue(process.env.ADMIN_PASSWORD);

    if (!email && !password) return false;
    if (!email || !password) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must both be configured");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
        where: { email },
        update: { password: hashedPassword, role: "SUPERADMIN", mustChangePassword: false },
        create: {
            email,
            name: "Super Admin",
            password: hashedPassword,
            role: "SUPERADMIN",
            mustChangePassword: false,
        },
    });

    return true;
}