import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/modules/whatsapp/manager";

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

        // Fetch real aggregated metrics from Database
        const [
            totalTenants,
            activeTenants,
            suspendedTenants,
            totalSessions,
            totalMessages,
            totalContacts,
            totalAutoReplies,
            recentLogs
        ] = await Promise.all([
            prisma.tenant.count(),
            prisma.tenant.count({ where: { status: "ACTIVE" } }),
            prisma.tenant.count({ where: { status: "SUSPENDED" } }),
            prisma.session.count(),
            prisma.message.count(),
            prisma.contact.count(),
            prisma.autoReply.count(),
            prisma.auditLog.findMany({
                take: 10,
                orderBy: { createdAt: "desc" },
                include: {
                    tenant: { select: { id: true, name: true, slug: true } },
                    user: { select: { id: true, name: true, email: true } }
                }
            })
        ]);

        // Evaluate live WhatsApp session states
        const allDbSessions = await prisma.session.findMany({
            select: { sessionId: true, status: true, tenantId: true }
        });

        let connectedSessions = 0;
        let disconnectedSessions = 0;

        for (const s of allDbSessions) {
            const instance = waManager.getInstance(s.sessionId);
            const liveStatus = instance?.status || s.status;
            if (liveStatus === "CONNECTED") {
                connectedSessions++;
            } else {
                disconnectedSessions++;
            }
        }

        // Platform Health & Memory
        const mem = process.memoryUsage();
        const health = {
            status: "HEALTHY",
            uptimeSeconds: Math.floor(process.uptime()),
            nodeVersion: process.version,
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            activeInstancesInMemory: waManager ? Array.from(waManager["sessions"]?.keys() || []).length : 0,
            dbConnected: true
        };

        return NextResponse.json({
            success: true,
            status: true,
            data: {
                clients: {
                    total: totalTenants,
                    active: activeTenants,
                    suspended: suspendedTenants
                },
                sessions: {
                    total: totalSessions,
                    connected: connectedSessions,
                    disconnected: disconnectedSessions
                },
                usage: {
                    totalMessages,
                    totalContacts,
                    totalAutoReplies
                },
                health,
                recentActivity: recentLogs
            }
        });
    } catch (error: any) {
        console.error("Super Admin Stats Error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to retrieve platform metrics",
            error: { code: "STATS_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
