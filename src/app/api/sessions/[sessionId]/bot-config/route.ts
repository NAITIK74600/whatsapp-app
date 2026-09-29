import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";
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
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        // @ts-ignore
        const session = await (prisma as any).session.findUnique({
            where: { sessionId },
            select: { id: true, botConfig: true }
        });

        if (!session) {
            return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });
        }

        // Return config or default if null
        session.botConfig = session.botConfig || {
            enabled: true,
            botMode: 'OWNER',
            botAllowedJids: [],
            botBlockedJids: [],
            autoReplyMode: 'ALL',
            autoReplyAllowedJids: [],
            autoReplyBlockedJids: [],
            enableSticker: true,
            enablePing: true,
            enableUptime: true,
            botName: "WA-AKG Bot",
            removeBgApiKey: null,
            enableVideoSticker: true,
            maxStickerDuration: 10,
            prefix: "#",
            antiSpamEnabled: true,
            spamLimit: 5,
            spamInterval: 10,
            spamDelayMin: 1500,
            spamDelayMax: 3500,
            simulatePresence: true,
            autoOptOut: true,
            dailyLimit: 500,
            enableWelcomeMessage: false,
            welcomeMessage: null,
            autoRead: false,
            alwaysOnline: false,
            aiEnabled: false,
            aiTriggerMode: "FALLBACK",
            aiProvider: "openrouter",
            aiApiKey: null,
            aiModel: "openai/gpt-4o-mini",
            aiApiUrl: null,
            aiSystemPrompt: null,
            aiTemperature: 0.7,
            aiMaxTokens: 500
        };

        return NextResponse.json({ status: true, message: "Bot config fetched successfully", data: session.botConfig });
    } catch (error) {
        console.error("Get Bot Config Error:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });

        const body = await request.json();

        // Find session DB ID
        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { id: true }
        });

        if (!session) return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });

        // Upsert Config
        // @ts-ignore
        const config = await (prisma as any).botConfig.upsert({
            where: { sessionId: session.id },
            create: {
                sessionId: session.id,
                enabled: body.enabled ?? true,
                botMode: body.botMode || 'OWNER',
                botAllowedJids: body.botAllowedJids || [],
                botBlockedJids: body.botBlockedJids || [],
                autoReplyMode: body.autoReplyMode || 'ALL',
                autoReplyAllowedJids: body.autoReplyAllowedJids || [],
                autoReplyBlockedJids: body.autoReplyBlockedJids || [],

                enableSticker: body.enableSticker ?? true,
                enableVideoSticker: body.enableVideoSticker ?? true,
                maxStickerDuration: body.maxStickerDuration || 10,
                enablePing: body.enablePing ?? true,
                enableUptime: body.enableUptime ?? true,
                removeBgApiKey: body.removeBgApiKey || null,
                prefix: body.prefix || "#",
                antiSpamEnabled: body.antiSpamEnabled ?? true,
                spamLimit: body.spamLimit || 5,
                spamInterval: body.spamInterval || 10,
                spamDelayMin: body.spamDelayMin || 1500,
                spamDelayMax: body.spamDelayMax || 3500,
                simulatePresence: body.simulatePresence ?? true,
                autoOptOut: body.autoOptOut ?? true,
                dailyLimit: body.dailyLimit || 500,
                enableWelcomeMessage: body.enableWelcomeMessage ?? false,
                welcomeMessage: body.welcomeMessage || null,
                autoRead: body.autoRead ?? false,
                alwaysOnline: body.alwaysOnline ?? false,
                aiEnabled: body.aiEnabled ?? false,
                aiTriggerMode: body.aiTriggerMode || "FALLBACK",
                aiProvider: body.aiProvider || "openrouter",
                aiApiKey: body.aiApiKey || null,
                aiModel: body.aiModel || (body.aiProvider === "gemini" ? "gemini-2.5-flash" : body.aiProvider === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini"),
                aiApiUrl: body.aiProvider === "custom" ? (body.aiApiUrl || null) : null,
                aiSystemPrompt: body.aiSystemPrompt || null,
                aiTemperature: body.aiTemperature !== undefined ? parseFloat(body.aiTemperature) : 0.7,
                aiMaxTokens: body.aiMaxTokens !== undefined ? parseInt(body.aiMaxTokens) : 500,
            },
            update: {
                botMode: body.botMode,
                botAllowedJids: body.botAllowedJids,
                botBlockedJids: body.botBlockedJids,
                autoReplyMode: body.autoReplyMode,
                autoReplyAllowedJids: body.autoReplyAllowedJids,
                autoReplyBlockedJids: body.autoReplyBlockedJids,
                botName: body.botName,
                enableSticker: body.enableSticker,
                enableVideoSticker: body.enableVideoSticker,
                maxStickerDuration: body.maxStickerDuration,
                enablePing: body.enablePing,
                enableUptime: body.enableUptime,
                removeBgApiKey: body.removeBgApiKey || null,
                prefix: body.prefix,
                antiSpamEnabled: body.antiSpamEnabled,
                spamLimit: body.spamLimit,
                spamInterval: body.spamInterval,
                spamDelayMin: body.spamDelayMin,
                spamDelayMax: body.spamDelayMax,
                simulatePresence: body.simulatePresence,
                autoOptOut: body.autoOptOut,
                dailyLimit: body.dailyLimit,
                enableWelcomeMessage: body.enableWelcomeMessage ?? false,
                welcomeMessage: body.welcomeMessage,
                autoRead: body.autoRead,
                alwaysOnline: body.alwaysOnline,
                aiEnabled: body.aiEnabled,
                aiTriggerMode: body.aiTriggerMode,
                aiProvider: body.aiProvider,
                aiApiKey: body.aiApiKey,
                aiModel: body.aiModel,
                aiApiUrl: body.aiProvider === "custom" ? (body.aiApiUrl || null) : null,
                aiSystemPrompt: body.aiSystemPrompt !== undefined ? (body.aiSystemPrompt || null) : undefined,
                aiTemperature: body.aiTemperature !== undefined ? parseFloat(body.aiTemperature) : undefined,
                aiMaxTokens: body.aiMaxTokens !== undefined ? parseInt(body.aiMaxTokens) : undefined,
            }
        });

        // Clear antispam cache so new settings apply instantly
        const { antispam } = await import("@/modules/whatsapp/antispam");
        antispam.clearCache(sessionId);

        return NextResponse.json({ status: true, message: "Bot config updated successfully", data: config });
    } catch (error) {
        console.error("Update Bot Config Error:", error);
        return NextResponse.json({ status: false, message: "Failed to update config", error: "Failed to update config" }, { status: 500 });
    }
}
