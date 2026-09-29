import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";

export const dynamic = 'force-dynamic';

// GET: Get QR code for session
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId: idParam } = await params;

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

        // Resolve by sessionId slug or DB cuid
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

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, session.sessionId);
        if (!canAccess) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden",
                error: { code: "FORBIDDEN", message: "Cannot access this session" }
            }, { status: 403 });
        }

        let instance = waManager.getInstance(session.sessionId);

        // If no instance exists and session is not logged out or connected, start it to generate QR
        if (!instance && session.status !== "CONNECTED" && session.status !== "LOGGED_OUT") {
            try {
                instance = await waManager.startSession(session.sessionId);
            } catch (startErr) {
                console.error("Auto-start session error during QR request:", startErr);
            }
        }

        const currentStatus = instance?.status || session.status;

        // If already connected
        if (currentStatus === "CONNECTED") {
            return NextResponse.json({
                success: true,
                status: true,
                message: "Session is already connected",
                data: {
                    connected: true,
                    status: "CONNECTED",
                    qr: null,
                    base64: null
                }
            });
        }

        const qr = instance?.qr || session.qr;

        if (!qr) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "QR code not available yet. WhatsApp client is initializing...",
                data: {
                    connected: false,
                    status: currentStatus,
                    qr: null,
                    base64: null
                }
            }, { status: 200 }); // Return 200 with status so polling doesn't treat it as error
        }

        // Generate base64 QR code image
        const base64QR = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 320,
            color: {
                dark: "#0f172a",
                light: "#ffffff"
            }
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "QR code retrieved successfully",
            data: {
                connected: false,
                status: currentStatus,
                qr,
                base64: base64QR,
                pairingCode: instance?.pairingCode || null
            }
        });

    } catch (error: any) {
        console.error("Get QR error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to get QR code",
            error: { code: "QR_FETCH_FAILED", message: error.message || "Failed to retrieve QR code" }
        }, { status: 500 });
    }
}
