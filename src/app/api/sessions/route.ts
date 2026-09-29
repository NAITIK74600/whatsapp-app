import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, getAccessibleSessions } from "@/lib/api-auth";

export const dynamic = 'force-dynamic';

// GET: Fetch sessions (filtered by user role and merged with live memory status)
export async function GET(request: NextRequest) {
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

        // Get sessions based on user role
        const sessions = await getAccessibleSessions(user.id, user.role);

        // Merge live in-memory status and QR info
        const enrichedSessions = sessions.map((s: any) => {
            const instance = waManager.getInstance(s.sessionId);
            const liveStatus = instance?.status || s.status;
            const liveQr = instance?.qr || s.qr;
            return {
                ...s,
                status: liveStatus,
                qr: liveQr,
                qrAvailable: !!liveQr,
                hasActiveClient: !!instance
            };
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Sessions retrieved successfully",
            data: enrichedSessions
        });
    } catch (error: any) {
        console.error("Get sessions error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to fetch sessions",
            error: { code: "SESSIONS_FETCH_FAILED", message: error.message || "Failed to fetch sessions" }
        }, { status: 500 });
    }
}

// POST: Create new session (always for the authenticated user)
export async function POST(request: NextRequest) {
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

        const body = await request.json().catch(() => ({}));
        const { name, sessionId } = body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Session name is required",
                error: { code: "VALIDATION_ERROR", message: "Session name is required and cannot be empty" }
            }, { status: 400 });
        }

        const cleanName = name.trim();
        if (cleanName.length < 2 || cleanName.length > 50) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Session name must be between 2 and 50 characters",
                error: { code: "VALIDATION_ERROR", message: "Session name must be between 2 and 50 characters" }
            }, { status: 400 });
        }

        // Create session and initialize WhatsApp client
        try {
            const session = await waManager.createSession(user.id, cleanName, sessionId);

            return NextResponse.json({
                success: true,
                status: true,
                message: "Session initialization started",
                data: {
                    id: session.id,
                    sessionId: session.sessionId,
                    name: session.name,
                    status: session.status || "CONNECTING",
                    qrAvailable: false,
                    createdAt: session.createdAt
                }
            }, { status: 201 });
        } catch (initError: any) {
            const isDuplicate = initError.message?.includes("already exists") || initError.message?.includes("unique");
            return NextResponse.json({
                success: false,
                status: false,
                message: initError.message || "Unable to initialize WhatsApp session",
                error: {
                    code: isDuplicate ? "DUPLICATE_SESSION" : "SESSION_INITIALIZATION_FAILED",
                    message: initError.message || "Unable to initialize WhatsApp session"
                }
            }, { status: isDuplicate ? 409 : 500 });
        }

    } catch (error: any) {
        console.error("Create session error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Unable to initialize WhatsApp session",
            error: {
                code: "SESSION_INITIALIZATION_FAILED",
                message: error.message || "Unexpected server error"
            }
        }, { status: 500 });
    }
}
