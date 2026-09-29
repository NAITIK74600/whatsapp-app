import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generateAiReply, resolveAiConfig } from "@/modules/whatsapp/bot/ai-reply";

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

        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { id: true, tenantId: true, botConfig: true }
        });

        if (!session) {
            return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });
        }

        const body = await request.json().catch(() => ({}));
        
        // Use supplied test values from request body or fallback to saved botConfig
        const rawProvider = (body.aiProvider || session.botConfig?.aiProvider || "openrouter").toLowerCase().trim();
        const isCustom = rawProvider === "custom";

        const testConfig = {
            aiProvider: rawProvider,
            aiApiKey: body.aiApiKey !== undefined ? body.aiApiKey : session.botConfig?.aiApiKey,
            aiModel: body.aiModel || session.botConfig?.aiModel,
            aiApiUrl: isCustom ? (body.aiApiUrl ?? session.botConfig?.aiApiUrl ?? null) : null,
        };

        const resolved = resolveAiConfig(testConfig);
        if (!resolved.apiKey) {
            return NextResponse.json({
                status: false,
                message: "No API Key provided. Please enter an API key or set AI_API_KEY environment variable.",
                error: "Missing API key"
            }, { status: 400 });
        }

        const testUserMessage = body.userMessage || "Hello! This is a test message. Please confirm you are working in 1 short sentence.";
        const testSystemPrompt = body.systemPrompt || session.botConfig?.aiSystemPrompt || "You are an AI assistant verifying an API connection. Reply briefly.";

        const reply = await generateAiReply({
            userMessage: testUserMessage,
            systemPrompt: testSystemPrompt,
            botName: session.botConfig?.botName || "Test Bot",
            tenantId: session.tenantId,
            config: testConfig
        });

        return NextResponse.json({
            status: true,
            message: "AI connection successful!",
            data: {
                reply,
                provider: resolved.provider,
                model: resolved.model,
                endpoint: resolved.endpoint,
            }
        });
    } catch (error: any) {
        console.error("Test AI Error:", error);
        return NextResponse.json({
            status: false,
            message: error?.message || "Failed to connect to AI provider",
            error: error?.message || "Unknown error"
        }, { status: 500 });
    }
}
