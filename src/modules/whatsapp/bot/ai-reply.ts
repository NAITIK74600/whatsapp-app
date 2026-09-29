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
        aiSystemPrompt?: string | null;
        aiTemperature?: number | null;
        aiMaxTokens?: number | null;
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
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

let cachedSystemConfig: any = null;
let lastCacheTime = 0;

export async function getSystemAiConfig() {
    const now = Date.now();
    if (cachedSystemConfig && (now - lastCacheTime < 30000)) {
        return cachedSystemConfig;
    }
    try {
        const sys = await (prisma as any).systemConfig.findUnique({
            where: { id: "default" }
        });
        cachedSystemConfig = sys;
        lastCacheTime = now;
        return sys;
    } catch {
        return cachedSystemConfig;
    }
}

export function invalidateSystemAiConfigCache() {
    cachedSystemConfig = null;
    lastCacheTime = 0;
}

export function resolveAiConfig(
    config?: {
        aiProvider?: string | null;
        aiApiKey?: string | null;
        aiModel?: string | null;
        aiApiUrl?: string | null;
        aiSystemPrompt?: string | null;
        aiTemperature?: number | null;
        aiMaxTokens?: number | null;
    } | null,
    systemConfig?: {
        aiProvider?: string | null;
        aiApiKey?: string | null;
        aiModel?: string | null;
        aiSystemPrompt?: string | null;
    } | null
) {
    const activeSystem = systemConfig || cachedSystemConfig;
    
    // Priority: Session botConfig (frontend) -> SystemConfig (frontend) -> process.env
    const apiKey = (
        config?.aiApiKey?.trim() || 
        activeSystem?.aiApiKey?.trim() || 
        process.env.AI_API_KEY?.trim() || 
        ""
    );

    let preferredProvider = "";
    if (config?.aiApiKey?.trim()) {
        preferredProvider = (config.aiProvider || "").toLowerCase().trim();
    } else if (activeSystem?.aiApiKey?.trim()) {
        preferredProvider = (activeSystem?.aiProvider || config?.aiProvider || "").toLowerCase().trim();
    } else {
        preferredProvider = (config?.aiProvider || process.env.AI_PROVIDER || "").toLowerCase().trim();
    }

    const envProvider = (process.env.AI_PROVIDER || "").toLowerCase().trim();

    // Detect provider signatures
    const isKeyOpenRouter = apiKey.startsWith("sk-or-");
    const isKeyGemini = apiKey.startsWith("AIzaSy");
    const isExplicitCustom = preferredProvider === "custom";
    const isExplicitOpenAi = preferredProvider === "openai";
    const isExplicitOpenRouter = preferredProvider === "openrouter";
    const isExplicitGemini = preferredProvider === "gemini" || preferredProvider === "google";

    // Determine final provider
    let provider = "openrouter";
    if (isExplicitCustom) {
        provider = "custom";
    } else if (isExplicitGemini || isKeyGemini) {
        provider = "gemini";
    } else if (isExplicitOpenAi) {
        provider = "openai";
    } else if (isKeyOpenRouter || isExplicitOpenRouter) {
        provider = "openrouter";
    } else if (apiKey.startsWith("sk-") && !isKeyOpenRouter) {
        provider = "openai";
    } else if (envProvider === "gemini" || envProvider === "google") {
        provider = "gemini";
    } else if (envProvider === "openai") {
        provider = "openai";
    } else {
        provider = isKeyGemini ? "gemini" : "openrouter";
    }

    const isOpenRouter = provider === "openrouter" || isKeyOpenRouter;
    const isGemini = provider === "gemini";

    // Determine endpoint
    let endpoint = "";
    if (provider === "custom") {
        endpoint = (config?.aiApiUrl?.trim() || process.env.AI_API_URL?.trim() || OPENAI_ENDPOINT);
    } else if (isGemini) {
        endpoint = GEMINI_ENDPOINT;
    } else if (isOpenRouter) {
        if (config?.aiApiUrl?.trim() && config.aiApiUrl.includes("openrouter.ai")) {
            endpoint = config.aiApiUrl.trim();
        } else {
            endpoint = OPENROUTER_ENDPOINT;
        }
    } else {
        endpoint = OPENAI_ENDPOINT;
    }

    if (endpoint.endsWith("/v1")) {
        endpoint = `${endpoint}/chat/completions`;
    } else if (endpoint.endsWith("/v1/")) {
        endpoint = `${endpoint}chat/completions`;
    }

    let model = (config?.aiModel?.trim() || activeSystem?.aiModel?.trim() || "").trim();
    if (!model) {
        if (isGemini) {
            model = "gemini-2.5-flash";
        } else if (isOpenRouter) {
            model = "openai/gpt-4o-mini";
        } else {
            model = process.env.AI_MODEL || "gpt-4o-mini";
        }
    }

    if (isGemini) {
        if (!model.toLowerCase().includes("gemini") || model === "gemini-2.0-flash") {
            model = "gemini-2.5-flash";
        } else {
            if (model.includes("/")) {
                model = model.split("/").pop() || "gemini-2.5-flash";
            }
            if (model === "gemini-2.0-flash") {
                model = "gemini-2.5-flash";
            }
        }
    } else if (isOpenRouter) {
        if (!model.includes("/")) {
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
        if (model.includes("/")) {
            model = model.split("/").pop() || "gpt-4o-mini";
        }
    }

    const rawTemp = (config?.aiTemperature !== undefined && config?.aiTemperature !== null) 
        ? config.aiTemperature 
        : process.env.AI_TEMPERATURE;
    const temperature = Number(rawTemp ?? "0.7");

    const rawMaxTokens = (config?.aiMaxTokens !== undefined && config?.aiMaxTokens !== null) 
        ? config.aiMaxTokens 
        : process.env.AI_MAX_TOKENS;
    const maxTokens = Number(rawMaxTokens ?? "500");

    return {
        apiKey,
        isOpenRouter,
        isGemini,
        provider,
        endpoint,
        model,
        temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : 0.7,
        maxTokens: Number.isFinite(maxTokens) ? Math.min(Math.max(Math.floor(maxTokens), 1), 4000) : 500,
    };
}

export function isAiConfigured(config?: any) {
    const key = config?.aiApiKey?.trim() || cachedSystemConfig?.aiApiKey?.trim() || process.env.AI_API_KEY?.trim();
    return !!key;
}

export async function generateAiReply({ userMessage, systemPrompt, botName, tenantId, config }: GenerateAiReplyInput) {
    const systemConfig = await getSystemAiConfig();
    const aiConfig = resolveAiConfig(config, systemConfig);

    if (!aiConfig.apiKey) {
        throw new Error("AI API Key is not configured (checked session config, global system settings, and environment variables)");
    }

    const effectiveSystemPrompt = 
        systemPrompt?.trim() || 
        (config as any)?.aiSystemPrompt?.trim() || 
        systemConfig?.aiSystemPrompt?.trim() || 
        process.env.AI_SYSTEM_PROMPT?.trim() || 
        DEFAULT_SYSTEM_PROMPT;

    // Build system prompt with optional tenant business context and knowledge base
    const promptParts: string[] = [
        effectiveSystemPrompt,
        botName ? `Your bot name is "${botName}".` : ""
    ];

    if (tenantId) {
        try {
            const [tenant, kbEntries] = await Promise.all([
                prisma.tenant.findUnique({ where: { id: tenantId } }).catch(() => null),
                prisma.knowledgeEntry.findMany({
                    where: { tenantId, isVerified: true },
                    take: 100,
                    orderBy: [{ category: "asc" }, { updatedAt: "desc" }]
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
            }

            promptParts.push(`
--- CRITICAL ESCALATION & PAYMENT POLICIES ---
1. PAYMENTS, BANK ACCOUNTS & TRANSACTIONS:
   - You are an AI assistant. You CANNOT process payments, take credit cards, share banking/IBAN details, or collect down payments.
   - When a customer wants to pay, make a deposit, or finalize a deal:
     Warmly confirm their intent, congratulate them on selecting the vehicle/service, and explain that for their security, official invoices, contracts, and payment links are provided directly by our sales/finance team.
     At the end of your response, add: [ESCALATE_TO_HUMAN: PAYMENT]
2. REQUESTING A REAL PERSON / HUMAN AGENT:
   - If the customer asks to speak with a human, agent, salesperson, manager, or real staff member (in English, German, French, or any language):
     Politely confirm that you have flagged their conversation and an advisor will join this chat / reach out shortly to assist them personally.
     At the end of your response, add: [ESCALATE_TO_HUMAN: AGENT_REQUEST]
3. FINAL CONTRACTS & SPECIAL NEGOTIATIONS:
   - You cannot negotiate unauthorized discounts or sign contracts.
   - For special trade-in valuations, price negotiations, or signing, invite them to finalize directly with our sales team.
     At the end of your response, add: [ESCALATE_TO_HUMAN: CONTRACT_DEAL]
4. GENERAL UNKNOWN FACTS:
   - If user asks about something not in the knowledge base, politely state you will have an advisor verify it for them.
`);
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

    if (aiConfig.isGemini) {
        headers["x-goog-api-key"] = aiConfig.apiKey;
    }

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

            if ((response.status === 400 || response.status === 401 || response.status === 403) && aiConfig.isGemini) {
                throw new Error(`Google AI Studio Authentication Failed (HTTP ${response.status}): ${errorDetail || "Invalid Gemini API key. Please check your key at https://aistudio.google.com/app/apikey"}`);
            }

            if (response.status === 429 && aiConfig.isGemini) {
                throw new Error(`Google Gemini Rate Limit Reached (HTTP 429): Free tier quota limit reached. Please retry in a few moments.`);
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
