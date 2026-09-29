import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get("tenantId") || undefined;
        const action = searchParams.get("action") || undefined;

        const where: any = {};
        if (tenantId) where.tenantId = tenantId;
        if (action) where.action = action;

        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 100,
            include: {
                tenant: { select: { id: true, name: true, slug: true } },
                user: { select: { id: true, name: true, email: true } }
            }
        });

        return NextResponse.json({
            success: true,
            status: true,
            data: logs
        });
    } catch (error: any) {
        console.error("Fetch audit logs error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to fetch audit logs",
            error: { code: "LOGS_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
