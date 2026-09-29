import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { antispam } from "@/modules/whatsapp/antispam";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        const audit = await antispam.getSafetyAudit(sessionId);

        return NextResponse.json({
            success: true,
            status: true,
            message: "Safety audit generated successfully",
            data: audit
        });
    } catch (error: any) {
        console.error("Safety Audit Error:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: error.message }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        const preset = body.preset as "ULTRA_SAFE" | "BALANCED" | "HIGH_VOLUME";

        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { id: true }
        });

        if (!session) {
            return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });
        }

        let updateData: any = {};

        switch (preset) {
            case "ULTRA_SAFE":
                // For new numbers or warming up accounts
                updateData = {
                    antiSpamEnabled: true,
                    spamLimit: 3,
                    spamInterval: 15,
                    spamDelayMin: 3000,
                    spamDelayMax: 6000,
                    simulatePresence: true,
                    autoOptOut: true,
                    dailyLimit: 200,
                };
                break;
            case "BALANCED":
                // Recommended for typical business messaging
                updateData = {
                    antiSpamEnabled: true,
                    spamLimit: 5,
                    spamInterval: 10,
                    spamDelayMin: 1500,
                    spamDelayMax: 3500,
                    simulatePresence: true,
                    autoOptOut: true,
                    dailyLimit: 500,
                };
                break;
            case "HIGH_VOLUME":
                // For aged/warmed-up business numbers with high recipient engagement
                updateData = {
                    antiSpamEnabled: true,
                    spamLimit: 8,
                    spamInterval: 10,
                    spamDelayMin: 1000,
                    spamDelayMax: 2500,
                    simulatePresence: true,
                    autoOptOut: true,
                    dailyLimit: 1200,
                };
                break;
            default:
                return NextResponse.json({ status: false, message: "Invalid preset mode", error: "Invalid preset mode" }, { status: 400 });
        }

        const updated = await prisma.botConfig.upsert({
            where: { sessionId: session.id },
            create: {
                sessionId: session.id,
                enabled: true,
                ...updateData
            },
            update: updateData
        });

        antispam.clearCache(sessionId);

        return NextResponse.json({
            success: true,
            status: true,
            message: `Safety preset ${preset} applied successfully`,
            data: updated
        });
    } catch (error: any) {
        console.error("Apply Safety Preset Error:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: error.message }, { status: 500 });
    }
}
