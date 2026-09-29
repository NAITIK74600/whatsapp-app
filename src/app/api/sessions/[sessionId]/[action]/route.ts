import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession, isSessionOwner } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, action: string }> }
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
        const action = resolvedParams.action?.toLowerCase();

        // Resolve session by slug or id
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

        const targetSessionId = session.sessionId;

        // Verify access
        const canAccess = await canAccessSession(user.id, user.role, targetSessionId);
        if (!canAccess) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden",
                error: { code: "FORBIDDEN", message: "Cannot control this session" }
            }, { status: 403 });
        }

        // Validate Action
        const validActions = ["start", "stop", "restart", "reconnect", "logout", "pair"];
        if (!validActions.includes(action)) {
            return NextResponse.json({
                success: false,
                status: false,
                message: `Invalid action "${action}". Valid actions are: ${validActions.join(", ")}`,
                error: { code: "INVALID_ACTION", message: `Supported actions: ${validActions.join(", ")}` }
            }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));

        switch (action) {
            case "pair": {
                const { phoneNumber } = body;
                if (!phoneNumber || typeof phoneNumber !== "string") {
                    return NextResponse.json({
                        success: false,
                        status: false,
                        message: "Phone number is required for pairing code generation",
                        error: { code: "MISSING_PHONE_NUMBER", message: "Phone number required (e.g. 628123456789)" }
                    }, { status: 400 });
                }
                const pairingCode = await waManager.requestPairingCode(targetSessionId, phoneNumber);
                return NextResponse.json({
                    success: true,
                    status: true,
                    message: "Pairing code generated successfully",
                    data: { pairingCode }
                });
            }

            case "start":
                await waManager.startSession(targetSessionId);
                break;

            case "stop":
                await waManager.stopSession(targetSessionId);
                break;

            case "restart":
            case "reconnect":
                await waManager.restartSession(targetSessionId);
                break;

            case "logout": {
                // Must be owner or admin to log out
                const isOwner = await isSessionOwner(user.id, user.role, targetSessionId);
                if (!isOwner) {
                    return NextResponse.json({
                        success: false,
                        status: false,
                        message: "Forbidden - Only the session owner can log out this session",
                        error: { code: "FORBIDDEN", message: "Only the session owner can log out this session" }
                    }, { status: 403 });
                }

                const instance = waManager.getInstance(targetSessionId);
                if (instance?.socket) {
                    try {
                        await instance.socket.logout();
                    } catch (e) {
                        // fallback below
                    }
                }

                // Delete stored auth credentials
                await prisma.$transaction([
                    prisma.session.update({
                        where: { id: session.id },
                        data: { status: "LOGGED_OUT", qr: null }
                    }),
                    prisma.authState.deleteMany({
                        where: { sessionId: targetSessionId }
                    })
                ]).catch(() => {});

                waManager.removeInstance(targetSessionId);
                break;
            }
        }

        return NextResponse.json({
            success: true,
            status: true,
            message: `Session action "${action}" executed successfully`,
            data: {
                sessionId: targetSessionId,
                action
            }
        });

    } catch (error: any) {
        console.error(`Session action error:`, error);
        return NextResponse.json({
            success: false,
            status: false,
            message: `Failed to perform action: ${error.message || "Unknown error"}`,
            error: { code: "ACTION_FAILED", message: error.message || "Failed to perform session action" }
        }, { status: 500 });
    }
}
