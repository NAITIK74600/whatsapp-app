import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(
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

        const canAccess = await canAccessSession(user.id, user.role, session.sessionId);
        if (!canAccess) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden",
                error: { code: "FORBIDDEN", message: "Cannot reconnect this session" }
            }, { status: 403 });
        }

        await waManager.restartSession(session.sessionId);

        return NextResponse.json({
            success: true,
            status: true,
            message: "Session reconnecting initiated",
            data: {
                sessionId: session.sessionId,
                status: "CONNECTING"
            }
        });

    } catch (error: any) {
        console.error("Reconnect session error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: `Failed to reconnect session: ${error.message || "Unknown error"}`,
            error: { code: "RECONNECT_FAILED", message: error.message || "Failed to reconnect session" }
        }, { status: 500 });
    }
}
