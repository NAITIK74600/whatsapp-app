import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

// GET /api/sessions/:id/status — retrieve current connection status
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "UNAUTHORIZED", message: "Authentication required" }
            }, { status: 401 });
        }

        const { sessionId: idParam } = await params;

        // Resolve by sessionId or DB cuid
        const session = await prisma.session.findFirst({
            where: {
                OR: [
                    { sessionId: idParam },
                    { id: idParam }
                ]
            },
            select: { id: true, sessionId: true, name: true, status: true, qr: true }
        });

        if (!session) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Session not found",
                error: { code: "SESSION_NOT_FOUND", message: `No session found with identifier "${idParam}"` }
            }, { status: 404 });
        }

        const canAccess = await canAccessSession(user.id, user.role, session.sessionId);
        if (!canAccess) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden",
                error: { code: "FORBIDDEN", message: "Cannot access this session" }
            }, { status: 403 });
        }

        const instance = waManager.getInstance(session.sessionId);
        const liveStatus = instance?.status || session.status;
        const isConnected = liveStatus === "CONNECTED";

        let uptime = 0;
        if (isConnected && instance?.startTime) {
            uptime = Math.floor((Date.now() - instance.startTime.getTime()) / 1000);
        }

        let me = null;
        if (isConnected && instance?.socket?.user) {
            me = {
                id: instance.socket.user.id,
                name: instance.socket.user.name || null
            };
        }

        const currentQr = instance?.qr || session.qr;

        return NextResponse.json({
            success: true,
            status: true,
            message: "Session status retrieved",
            data: {
                id: session.id,
                sessionId: session.sessionId,
                name: session.name,
                status: liveStatus,
                connected: isConnected,
                qrAvailable: !!currentQr && liveStatus === "SCAN_QR",
                pairingCode: instance?.pairingCode || null,
                uptime,
                me
            }
        });

    } catch (error: any) {
        console.error("Get session status error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to retrieve status",
            error: { code: "INTERNAL_ERROR", message: error.message || "Failed to retrieve session status" }
        }, { status: 500 });
    }
}
