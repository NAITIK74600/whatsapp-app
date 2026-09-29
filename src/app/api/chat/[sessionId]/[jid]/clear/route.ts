import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

async function handleClearChat(
    request: NextRequest,
    params: { sessionId: string; jid: string }
) {
    const { sessionId, jid } = params;
    const decodedJid = decodeURIComponent(jid);

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden" }, { status: 403 });
        }

        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { id: true }
        });

        if (!session) {
            return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });
        }

        const deleteResult = await prisma.message.deleteMany({
            where: {
                sessionId: session.id,
                remoteJid: decodedJid
            }
        });

        try {
            const { waManager } = await import("@/modules/whatsapp/manager");
            const instance = waManager.getInstance(sessionId);
            if (instance?.socket) {
                await (instance.socket as any).chatModify(
                    { delete: true, lastMessages: [] },
                    decodedJid
                );
            }
        } catch (e) {
            console.warn("Baileys chatModify clear warning:", e);
        }

        return NextResponse.json({
            status: true,
            success: true,
            message: `Chat history cleared (${deleteResult.count} messages deleted)`,
            count: deleteResult.count
        });
    } catch (error: any) {
        console.error("Clear chat error:", error);
        return NextResponse.json({
            status: false,
            message: "Failed to clear chat",
            error: error?.message || "Failed to clear chat"
        }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    const resolvedParams = await params;
    return handleClearChat(request, resolvedParams);
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    const resolvedParams = await params;
    return handleClearChat(request, resolvedParams);
}
