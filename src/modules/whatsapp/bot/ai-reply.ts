import { logger } from "@/lib/logger";

type GenerateAiReplyInput = {
    userMessage: string;
    systemPrompt?: string | null;
    botName?: string | null;
};

type ChatMessage = {
    role: "system" | "user";
    content: string;
};

const DEFAULT_SYSTEM_PROMPT = "You are a helpful WhatsApp business assistant. Reply clearly, briefly, and only answer the user's latest message. If you do not know something, say so and ask a short follow-up question.";

function getAiEndpoint() {
    return (process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions").trim();
}

function getAiModel() {
    return (process.env.AI_MODEL || "gpt-4o-mini").trim();
}

function getAiTemperature() {
    const value = Number(process.env.AI_TEMPERATURE ?? "0.7");
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 2) : 0.7;
}

function getAiMaxTokens() {
    const value = Number(process.env.AI_MAX_TOKENS ?? "500");
    return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1), 4000) : 500;
}

export function isAiConfigured() {
    return !!process.env.AI_API_KEY?.trim();
}

export async function generateAiReply({ userMessage, systemPrompt, botName }: GenerateAiReplyInput) {
    const apiKey = process.env.AI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("AI_API_KEY is not configured");
    }

    const messages: ChatMessage[] = [
        {
            role: "system",
            content: [
                systemPrompt?.trim() || process.env.AI_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT,
                botName ? `Your bot name is ${botName}.` : "",
            ].filter(Boolean).join("\n"),
        },
        { role: "user", content: userMessage },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(getAiEndpoint(), {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: getAiModel(),
                messages,
                temperature: getAiTemperature(),
                max_tokens: getAiMaxTokens(),
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`AI provider returned ${response.status}: ${errorText.slice(0, 300)}`);
        }

        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (!reply) {
            throw new Error("AI provider returned an empty reply");
        }

        return reply;
    } catch (error) {
        logger.error("AI", "Failed to generate reply", error);
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
