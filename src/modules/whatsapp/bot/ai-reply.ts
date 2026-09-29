import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type GenerateAiReplyInput = {
    userMessage: string;
    systemPrompt?: string | null;
    botName?: string | null;
    tenantId?: string | null;
    config?: {
        aiProvider?: string | null;
        aiApiKey?: string | null;
        aiModel?: string | null;
        aiApiUrl?: string | null;
    } | null;
};

type ChatMessage = {
    role: "system" | "user";
    content: string;
};

const DEFAULT_SYSTEM_PROMPT = `You are a professional WhatsApp business assistant.
Formatting & Style Guidelines:
• Structure your replies with clear paragraph breaks (double newlines) between different thoughts, steps, or details. Never send a solid, unbroken wall of text.
• Use bullet points (•) for lists, features, or itemized options.
• Use WhatsApp styling: *bold* for key phrases and prices, _italics_ for gentle emphasis. Never use Markdown headers (#, ##) or HTML tags.
• Keep replies professional, courteous, and easy to skim on mobile devices.
• If you do not have specific information, politely state so and ask how you can connect them to the staff.`;

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export function resolveAiConfig(config?: {
    aiProvider?: string | null;
    aiApiKey?: string | null;
    aiModel?: string | null;
    aiApiUrl?: string | null;
} | null) {
    const apiKey = (config?.aiApiKey?.trim() || process.env.AI_API_KEY?.trim() || "");
    const rawProvider = (config?.aiProvider || process.env.AI_PROVIDER || "").toLowerCase().trim();

    // Detect if key or explicit provider indicates OpenRouter
    const isKeyOpenRouter = apiKey.startsWith("sk-or-");
    const isExplicitOpenRouter = rawProvider === "openrouter";
    const isExplicitOpenAi = rawProvider === "openai";
    const isExplicitCustom = rawProvider === "custom";

    // Determine final provider
    let provider = "openrouter";
    if (isExplicitCustom) {
        provider = "custom";
    } else if (isExplicitOpenAi) {
        provider = "openai";
    } else if (isKeyOpenRouter || isExplicitOpenRouter) {
        provider = "openrouter";
    } else if (apiKey.startsWith("sk-") && !isKeyOpenRouter) {
        // Standard OpenAI key
        provider = "openai";
    } else {
        provider = rawProvider || "openrouter";
    }

    const isOpenRouter = provider === "openrouter" || isKeyOpenRouter;

    // Determine endpoint
    let endpoint = "";
    if (provider === "custom") {
        endpoint = (config?.aiApiUrl?.trim() || process.env.AI_API_URL?.trim() || OPENAI_ENDPOINT);
    } else if (isOpenRouter) {
        // OpenRouter must ALWAYS go to OpenRouter endpoint unless explicitly configured custom
        if (config?.aiApiUrl?.trim() && config.aiApiUrl.includes("openrouter.ai")) {
            endpoint = config.aiApiUrl.trim();
        } else {
            endpoint = OPENROUTER_ENDPOINT;
        }
    } else {
        // OpenAI
        endpoint = OPENAI_ENDPOINT;
    }

    if (endpoint.endsWith("/v1")) {
        endpoint = `${endpoint}/chat/completions`;
    } else if (endpoint.endsWith("/v1/")) {
        endpoint = `${endpoint}chat/completions`;
    }

    let model = (config?.aiModel || process.env.AI_MODEL || "").trim();
    if (isOpenRouter) {
        if (!model) {
            model = "openai/gpt-4o-mini";
        } else if (!model.includes("/")) {
            // Auto prefix well-known models if missing vendor prefix for OpenRouter
            if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3") || model.startsWith("chatgpt")) {
                model = `openai/${model}`;
            } else if (model.startsWith("claude-")) {
                model = `anthropic/${model}`;
            } else if (model.startsWith("gemini-")) {
                model = `google/${model}`;
            } else if (model.startsWith("llama-")) {
                model = `meta-llama/${model}`;
            } else if (model.startsWith("deepseek-")) {
                model = `deepseek/${model}`;
            } else if (model.startsWith("mistral-")) {
                model = `mistralai/${model}`;
            } else if (model.startsWith("qwen-") || model.startsWith("qwen")) {
                model = `qwen/${model}`;
            }
        }
    } else if (provider === "openai") {
        if (!model) {
            model = "gpt-4o-mini";
        } else if (model.includes("/")) {
            // Strip OpenRouter vendor prefix if switching back to official OpenAI (e.g. openai/gpt-4o-mini -> gpt-4o-mini)
            model = model.split("/").pop() || "gpt-4o-mini";
        }
    } else {
        model = model || "gpt-4o-mini";
    }

    const temperature = Number(process.env.AI_TEMPERATURE ?? "0.7");
    const maxTokens = Number(process.env.AI_MAX_TOKENS ?? "500");

    return {
        apiKey,
        isOpenRouter,
        provider,
        endpoint,
        model,
        temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : 0.7,
        maxTokens: Number.isFinite(maxTokens) ? Math.min(Math.max(Math.floor(maxTokens), 1), 4000) : 500,
    };
}

export function isAiConfigured(config?: any) {
    const key = config?.aiApiKey?.trim() || process.env.AI_API_KEY?.trim();
    return !!key;
}

export async function generateAiReply({ userMessage, systemPrompt, botName, tenantId, config }: GenerateAiReplyInput) {
    const aiConfig = resolveAiConfig(config);

    if (!aiConfig.apiKey) {
        throw new Error("AI API Key is not configured (checked session config and environment variables)");
    }

    // Build system prompt with optional tenant business context and knowledge base
    const promptParts: string[] = [
        systemPrompt?.trim() || process.env.AI_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT,
        botName ? `Your bot name is "${botName}".` : ""
    ];

    if (tenantId) {
        try {
            const [tenant, kbEntries] = await Promise.all([
                prisma.tenant.findUnique({ where: { id: tenantId } }).catch(() => null),
                prisma.knowledgeEntry.findMany({
                    where: { tenantId, isVerified: true },
                    take: 25,
                    orderBy: { category: "asc" }
                }).catch(() => [])
            ]);

            if (tenant) {
                promptParts.push("\n--- BUSINESS PROFILE & FACTS ---");
                promptParts.push(`Business Name: ${tenant.name}`);
                if (tenant.businessCategory) promptParts.push(`Industry: ${tenant.businessCategory}`);
                if (tenant.description) promptParts.push(`About: ${tenant.description}`);
                if (tenant.address) promptParts.push(`Address: ${tenant.address}, ${tenant.country || ""}`);
                if (tenant.phone) promptParts.push(`Phone: ${tenant.phone}`);
                if (tenant.email) promptParts.push(`Email: ${tenant.email}`);
                if (tenant.website) promptParts.push(`Website: ${tenant.website}`);
                if (tenant.businessHours) {
                    promptParts.push(`Opening Hours: ${JSON.stringify(tenant.businessHours)}`);
                }
            }

            if (kbEntries && kbEntries.length > 0) {
                promptParts.push("\n--- VERIFIED KNOWLEDGE BASE ---");
                for (const kb of kbEntries) {
                    promptParts.push(`• [${kb.category}] ${kb.title}: ${kb.content}`);
                }
                promptParts.push("\nImportant Rule: Answer user questions using the verified knowledge base and business profile above. If the customer asks for details outside this knowledge base, explain that you will pass their request to a human staff member.");
            }
        } catch (dbErr) {
            logger.error("AI", "Failed to load tenant knowledge context:", dbErr);
        }
    }

    const messages: ChatMessage[] = [
        {
            role: "system",
            content: promptParts.filter(Boolean).join("\n"),
        },
        { role: "user", content: userMessage },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    const headers: Record<string, string> = {
        "Authorization": `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
    };

    if (aiConfig.isOpenRouter) {
        headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || process.env.BASE_URL || "https://wa-akg.com";
        headers["X-Title"] = botName || process.env.APP_NAME || "WA-AKG Bot";
    }

    try {
        const response = await fetch(aiConfig.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: aiConfig.model,
                messages,
                temperature: aiConfig.temperature,
                max_tokens: aiConfig.maxTokens,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            let errorDetail = "";
            try {
                const errorData = await response.json();
                errorDetail = errorData?.error?.message || errorData?.message || JSON.stringify(errorData);
            } catch {
                errorDetail = await response.text().catch(() => "");
            }

            if (response.status === 401 && aiConfig.isOpenRouter) {
                throw new Error(`OpenRouter Authentication Failed (HTTP 401): ${errorDetail || "Invalid API key. Please check your key at https://openrouter.ai/keys."}`);
            }

            if (response.status === 402 && aiConfig.isOpenRouter) {
                throw new Error(`OpenRouter Credit Limit Reached (HTTP 402): ${errorDetail || "Insufficient credits. Please top up your balance at https://openrouter.ai/credits."}`);
            }

            throw new Error(`AI Provider (${aiConfig.provider}) HTTP ${response.status}: ${errorDetail.slice(0, 400)}`);
        }

        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (!reply) {
            throw new Error("AI provider returned an empty reply");
        }

        return reply;
    } catch (error: any) {
        logger.error("AI", "Failed to generate AI reply:", error?.message || error);
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
