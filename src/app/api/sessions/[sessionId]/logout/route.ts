import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, isSessionOwner } from "@/lib/api-auth";
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

        const isOwner = await isSessionOwner(user.id, user.role, session.sessionId);
        if (!isOwner) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden - Only the session owner can log out this session",
                error: { code: "FORBIDDEN", message: "Only the session owner can log out this session" }
            }, { status: 403 });
        }

        const instance = waManager.getInstance(session.sessionId);
        if (instance?.socket) {
            try {
                await instance.socket.logout();
            } catch (e) {
                // Ignore socket error and proceed with DB wipe
            }
        }

        await prisma.$transaction([
            prisma.session.update({
                where: { id: session.id },
                data: { status: "LOGGED_OUT", qr: null }
            }),
            prisma.authState.deleteMany({
                where: { sessionId: session.sessionId }
            })
        ]).catch(() => {});

        waManager.removeInstance(session.sessionId);

        return NextResponse.json({
            success: true,
            status: true,
            message: "Session logged out successfully and credentials removed",
            data: {
                sessionId: session.sessionId,
                status: "LOGGED_OUT"
            }
        });

    } catch (error: any) {
        console.error("Logout session error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: `Failed to log out session: ${error.message || "Unknown error"}`,
            error: { code: "LOGOUT_FAILED", message: error.message || "Failed to log out session" }
        }, { status: 500 });
    }
}
