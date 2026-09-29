import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/tenant-context";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !isAdmin(user.role)) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "FORBIDDEN", message: "Super Admin privileges required" }
            }, { status: 403 });
        }

        const resolvedParams = await params;
        const tenantId = resolvedParams.id;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
                memberships: {
                    where: { role: "OWNER" },
                    include: { user: true }
                }
            }
        });

        if (!tenant) {
            return NextResponse.json({
                success: false,
                message: "Client not found",
                error: { code: "NOT_FOUND", message: `No client found with id "${tenantId}"` }
            }, { status: 404 });
        }

        const ownerUser = tenant.memberships[0]?.user;
        if (!ownerUser) {
            return NextResponse.json({
                success: false,
                message: "No owner account linked to this client workspace",
                error: { code: "NO_OWNER", message: "No owner account found" }
            }, { status: 400 });
        }

        // Generate strong new temporary password
        const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
        const tempPassword = `Client#${randomHex}!${new Date().getFullYear()}`;
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        await prisma.user.update({
            where: { id: ownerUser.id },
            data: {
                password: hashedPassword,
                mustChangePassword: true
            }
        });

        await recordAuditLog({
            tenantId,
            userId: user.id,
            action: "PASSWORD_RESET_BY_ADMIN",
            resource: `User:${ownerUser.id}`,
            details: { targetEmail: ownerUser.email },
            request
        });

        const configuredBase = process.env.BASE_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
        let origin = "";
        if (configuredBase && !configuredBase.includes("localhost")) {
            origin = configuredBase.replace(/\/$/, "");
        } else {
            origin = request.nextUrl.origin ? request.nextUrl.origin.replace(/\/$/, "") : "http://localhost:3000";
            if (origin.startsWith("https://localhost")) {
                origin = origin.replace("https://", "http://");
            }
        }
        const loginUrl = `${origin}/auth/login`;

        const resetMessage = `🔑 Your temporary password has been reset:

🏢 Workspace: ${tenant.name}
🌐 Login URL: ${loginUrl}
📧 Email: ${ownerUser.email}
🔑 New Temporary Password: ${tempPassword}

Please log in and choose your new private password.`;

        return NextResponse.json({
            success: true,
            status: true,
            message: "Temporary password successfully reset",
            data: {
                temporaryPassword: tempPassword,
                email: ownerUser.email,
                loginUrl,
                resetMessage
            }
        });

    } catch (error: any) {
        console.error("Reset password error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to reset password",
            error: { code: "RESET_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
