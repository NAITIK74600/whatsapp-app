import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession, isSessionOwner } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

// GET: Retrieve session details
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

        const resolvedParams = await params;
        const idParam = resolvedParams.sessionId;

        // Resolve by sessionId slug OR database id
        const session = await prisma.session.findFirst({
            where: {
                OR: [
                    { sessionId: idParam },
                    { id: idParam }
                ]
            },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                },
                botConfig: true,
                webhooks: true,
                _count: {
                    select: {
                        groups: true,
                        messages: true,
                        contacts: true,
                        autoReplies: true,
                        scheduledMessages: true
                    }
                }
            }
        });

        if (!session) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Session not found",
                error: { code: "SESSION_NOT_FOUND", message: `No session found with identifier "${idParam}"` }
            }, { status: 404 });
        }

        // Verify access permissions
        const canAccess = await canAccessSession(user.id, user.role, session.sessionId);
        if (!canAccess) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden - Cannot access this session",
                error: { code: "FORBIDDEN", message: "You do not have permission to view this session" }
            }, { status: 403 });
        }

        // Live Instance Data
        const instance = waManager.getInstance(session.sessionId);
        const liveStatus = instance?.status || session.status;
        const isConnected = liveStatus === "CONNECTED";

        let uptime = 0;
        if (isConnected && instance?.startTime) {
            uptime = Math.floor((Date.now() - instance.startTime.getTime()) / 1000);
        }

        let me = null;
        if (isConnected && instance?.socket?.user) {
            me = instance.socket.user;
        }

        return NextResponse.json({
            success: true,
            status: true,
            message: "Session details retrieved successfully",
            data: {
                ...session,
                status: liveStatus,
                uptime,
                me,
                hasInstance: !!instance,
                qrAvailable: !!(instance?.qr || session.qr),
                qr: instance?.qr || session.qr,
                pairingCode: instance?.pairingCode || null
            }
        });

    } catch (error: any) {
        console.error("Get session details error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Internal Server Error",
            error: { code: "INTERNAL_ERROR", message: error.message || "Failed to retrieve session" }
        }, { status: 500 });
    }
}

// DELETE: Delete a session (permanently removes instance, credentials, and records)
export async function DELETE(
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

        const resolvedParams = await params;
        const idParam = resolvedParams.sessionId;

        // Resolve session by sessionId or id
        const session = await prisma.session.findFirst({
            where: {
                OR: [
                    { sessionId: idParam },
                    { id: idParam }
                ]
            }
        });

        if (!session) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Session not found",
                error: { code: "SESSION_NOT_FOUND", message: `No session found with identifier "${idParam}"` }
            }, { status: 404 });
        }

        // Only session owner or SUPERADMIN can delete
        const isOwner = await isSessionOwner(user.id, user.role, session.sessionId);
        if (!isOwner) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden - Only the session owner can delete this session",
                error: { code: "FORBIDDEN", message: "Only the session owner can delete this session" }
            }, { status: 403 });
        }

        // Delete from manager and database
        await waManager.deleteSession(session.sessionId);

        await prisma.auditLog.create({
            data: {
                tenantId: session.tenantId,
                userId: user.id,
                action: "SESSION_DELETED",
                resource: `Session:${session.sessionId}`,
                details: { sessionId: session.sessionId, name: session.name }
            }
        }).catch(() => {});

        return NextResponse.json({
            success: true,
            status: true,
            message: "Session and associated credentials deleted successfully",
            data: {
                sessionId: session.sessionId,
                id: session.id
            }
        });

    } catch (error: any) {
        console.error("Delete session error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to delete session",
            error: { code: "DELETE_FAILED", message: error.message || "Unexpected error while deleting session" }
        }, { status: 500 });
    }
}
