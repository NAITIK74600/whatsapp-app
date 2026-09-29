import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAccessibleSessions } from "@/lib/api-auth";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";

export const dynamic = 'force-dynamic';

// GET: Fetch sessions (filtered by tenant context and merged with live memory status)
export async function GET(request: NextRequest) {
    try {
        const context = await getTenantContext(request);
        if (!context) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "UNAUTHORIZED", message: "Authentication required" }
            }, { status: 401 });
        }

        if (context.tenant?.status === "SUSPENDED") {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Account suspended",
                error: { code: "ACCOUNT_SUSPENDED", message: "This workspace has been suspended. Please contact platform support." }
            }, { status: 403 });
        }

        // Get sessions based on user role and tenant context
        const tenantId = context.isSuperAdmin ? undefined : context.tenant?.id;
        const sessions = await getAccessibleSessions(context.user.id, context.user.role, tenantId);

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
            data: enrichedSessions,
            tenant: context.tenant ? {
                id: context.tenant.id,
                name: context.tenant.name,
                slug: context.tenant.slug,
                plan: context.tenant.plan,
                maxSessions: context.tenant.maxSessions
            } : null
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

// POST: Create new session (bound to user and active tenant)
export async function POST(request: NextRequest) {
    try {
        const context = await getTenantContext(request);
        if (!context) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "UNAUTHORIZED", message: "Authentication required" }
            }, { status: 401 });
        }

        if (!context.canManageSessions) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden",
                error: { code: "FORBIDDEN", message: "You do not have permission to create WhatsApp sessions in this workspace." }
            }, { status: 403 });
        }

        if (context.tenant?.status === "SUSPENDED") {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Account suspended",
                error: { code: "ACCOUNT_SUSPENDED", message: "This workspace has been suspended. Please contact platform support." }
            }, { status: 403 });
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

        // Create session and initialize WhatsApp client with tenant association
        try {
            const tenantId = context.tenant?.id;
            const session = await waManager.createSession(context.user.id, cleanName, sessionId, tenantId);

            await recordAuditLog({
                tenantId,
                userId: context.user.id,
                action: "SESSION_CREATED",
                resource: `Session:${session.sessionId}`,
                details: { name: cleanName, sessionId: session.sessionId },
                request
            });

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
                    createdAt: session.createdAt,
                    tenantId
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
            }, { status: isDuplicate ? 409 : 400 });
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
