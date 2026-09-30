import { NextResponse, NextRequest } from "next/server";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { resolveAiConfig, getSystemAiConfig } from "@/modules/whatsapp/bot/ai-reply";

export const dynamic = "force-dynamic";

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#8211;/gi, "-")
        .replace(/&#8212;/gi, "--")
        .replace(/&ndash;/gi, "-")
        .replace(/&mdash;/gi, "--");
}

function extractWebsiteContent(html: string, targetUrl: string): string {
    const parts: string[] = [];

    // 1. Extract Meta tags
    const metaTitleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (metaTitleMatch) {
        parts.push(`PAGE TITLE: ${decodeHtmlEntities(metaTitleMatch[1].trim())}`);
    }

    const metaDescriptions: string[] = [];
    const metaTags = html.matchAll(/<meta\s+[^>]*?(?:name|property)=["']([^"']+)["'][^>]*?content=["']([^"']+)["'][^>]*?>/gi);
    for (const match of metaTags) {
        const prop = match[1].toLowerCase();
        const content = match[2].trim();
        if (content && (prop.includes("description") || prop.includes("title") || prop === "keywords")) {
            metaDescriptions.push(`${prop}: ${decodeHtmlEntities(content)}`);
        }
    }
    if (metaDescriptions.length > 0) {
        parts.push(`META INFORMATION:\n${metaDescriptions.join("\n")}`);
    }

    // 2. Extract JSON-LD Structured Data (Schema.org)
    const ldJsonMatches = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    const structuredItems: string[] = [];
    for (const match of ldJsonMatches) {
        try {
            const raw = match[1].trim();
            if (raw) {
                const parsed = JSON.parse(raw);
                structuredItems.push(JSON.stringify(parsed, null, 2));
            }
        } catch {}
    }
    if (structuredItems.length > 0) {
        parts.push(`STRUCTURED BUSINESS DATA (JSON-LD):\n${structuredItems.join("\n---\n")}`);
    }

    // 3. Clean Main Body HTML
    let bodyHtml = html;
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        bodyHtml = bodyMatch[1];
    }

    // Remove scripts, styles, svgs, noscripts
    let cleanText = bodyHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    cleanText = cleanText
        .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
        .replace(/<[^>]+>/g, " ");

    cleanText = decodeHtmlEntities(cleanText);

    const bodyCleaned = cleanText
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join("\n");

    if (bodyCleaned.length > 30) {
        parts.push(`PAGE BODY CONTENT:\n${bodyCleaned}`);
    }

    return parts.join("\n\n").slice(0, 45000);
}

function parseJsonFromAi(contentStr: string): any {
    if (!contentStr || !contentStr.trim()) {
        throw new Error("AI returned an empty response. Please verify your API key and quota.");
    }

    let cleanStr = contentStr.trim();
    if (cleanStr.startsWith("```")) {
        cleanStr = cleanStr.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    }

    // Direct JSON parse attempt
    try {
        return JSON.parse(cleanStr);
    } catch {
        // Match outer JSON object
        const jsonMatch = cleanStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch {}
        }

        // Match JSON array of entries if root was array
        const arrayMatch = cleanStr.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try {
                const arr = JSON.parse(arrayMatch[0]);
                return { entries: arr };
            } catch {}
        }

        throw new Error("AI did not return a valid JSON structure. Please try again.");
    }
}

export async function POST(request: NextRequest) {
    try {
        const context = await getTenantContext(request);
        if (!context || !context.tenant) {
            return NextResponse.json({
                success: false,
                message: "No active workspace associated with account",
                error: { code: "NO_TENANT" }
            }, { status: 400 });
        }

        if (!context.canManageBot) {
            return NextResponse.json({
                success: false,
                message: "Forbidden - You do not have permission to manage knowledge base",
                error: { code: "FORBIDDEN" }
            }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        let targetUrl = (body.url || "").trim();

        if (!targetUrl) {
            return NextResponse.json({
                success: false,
                message: "Website URL is required"
            }, { status: 400 });
        }

        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
            targetUrl = `https://${targetUrl}`;
        }

        // Fetch website HTML
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        let html = "";
        try {
            const pageRes = await fetch(targetUrl, {
                signal: controller.signal,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            });

            if (!pageRes.ok) {
                throw new Error(`Failed to fetch website (HTTP ${pageRes.status})`);
            }

            html = await pageRes.text();
        } catch (fetchErr: any) {
            clearTimeout(timeout);
            return NextResponse.json({
                success: false,
                message: `Could not reach ${targetUrl}: ${fetchErr.message || "Request timed out or blocked"}`
            }, { status: 400 });
        } finally {
            clearTimeout(timeout);
        }

        let extractedContent = extractWebsiteContent(html, targetUrl);

        // SPA Fallback: If body has no content and no structured data was found, check for JavaScript bundle
        if (extractedContent.length < 100) {
            const bundleMatch = html.match(/src=["'](\/assets\/[^"']+\.js|https?:\/\/[^"']+\/assets\/[^"']+\.js)["']/i);
            if (bundleMatch) {
                try {
                    let bundleUrl = bundleMatch[1];
                    if (bundleUrl.startsWith("/")) {
                        const parsedBase = new URL(targetUrl);
                        bundleUrl = `${parsedBase.origin}${bundleUrl}`;
                    }
                    const bundleRes = await fetch(bundleUrl, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
                    });
                    if (bundleRes.ok) {
                        const bundleText = await bundleRes.text();
                        // Extract plain readable text segments from JS bundle (strings >= 20 chars)
                        const strMatches = bundleText.match(/"([^"\\]{20,200})"/g) || [];
                        const readable = strMatches
                            .map(s => s.slice(1, -1))
                            .filter(s => !s.includes("webpack") && !s.includes("import") && !s.includes("function") && !s.includes("<path") && /[a-zA-Z]{3,}/.test(s))
                            .slice(0, 100)
                            .join("\n");
                        if (readable.length > 50) {
                            extractedContent += `\n\nAPPLICATION CONTENT:\n${readable}`;
                        }
                    }
                } catch {}
            }
        }

        if (extractedContent.length < 50) {
            return NextResponse.json({
                success: false,
                message: "Website returned insufficient readable text content to analyze."
            }, { status: 400 });
        }

        // Resolve AI configuration
        const session = await prisma.session.findFirst({
            where: { tenantId: context.tenant.id },
            select: { botConfig: true }
        });

        const systemConfig = await getSystemAiConfig();
        const aiConfig = resolveAiConfig(session?.botConfig, systemConfig);

        if (!aiConfig.apiKey) {
            return NextResponse.json({
                success: false,
                message: "AI is not configured. Please enter your Gemini API key in Bot Settings or .env first."
            }, { status: 400 });
        }

        const systemInstruction = `You are a professional business analyst. Your job is to extract product, service, and company facts from website content to train a WhatsApp customer support AI bot.

Target Categories:
- PRODUCT: Vehicles/cars, catalog items, pricing, mileage, year, specs, condition, inventory.
- SERVICE: Services offered (repairs, financing, leasing, trade-in, test drives, maintenance).
- FAQ: Frequently asked questions and clear answers.
- POLICY: Warranty, return policy, payment terms, booking procedures.
- GENERAL: About the business, contact methods, locations, opening hours.

Extract between 5 to 30 concise, rich, and high-value items.
Return ONLY valid JSON matching this schema:
{
  "businessInfo": {
    "name": "string or null",
    "description": "string or null",
    "phone": "string or null",
    "email": "string or null",
    "address": "string or null",
    "openingHours": "string or null"
  },
  "entries": [
    {
      "category": "PRODUCT" | "SERVICE" | "FAQ" | "POLICY" | "GENERAL",
      "title": "Clear, specific title",
      "content": "Accurate, detailed description including price/specs if present"
    }
  ]
}`;

        const userPrompt = `Extract all products, services, opening hours, and business facts from this website (${targetUrl}):\n\n${extractedContent}`;

        let parsedResult: any = null;

        if (aiConfig.isGemini) {
            // For Gemini, use official native generateContent API with responseMimeType: "application/json"
            // This guarantees strictly valid JSON return without markdown code fences or syntax errors
            const candidateModels = Array.from(new Set([
                aiConfig.model || "gemini-3.5-flash",
                "gemini-3.5-flash",
                "gemini-3.7-flash",
                "gemini-3.8-flash",
                "gemini-flash-latest"
            ]));

            let lastErrorMessage = "";

            for (const modelName of candidateModels) {
                try {
                    const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${aiConfig.apiKey}`;
                    const aiRes = await fetch(nativeUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            systemInstruction: { parts: [{ text: systemInstruction }] },
                            contents: [{ parts: [{ text: userPrompt }] }],
                            generationConfig: {
                                responseMimeType: "application/json",
                                temperature: 0.2,
                                maxOutputTokens: 4000
                            }
                        })
                    });

                    if (aiRes.ok) {
                        const jsonRes = await aiRes.json();
                        const rawText = jsonRes?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (rawText) {
                            parsedResult = parseJsonFromAi(rawText);
                            break;
                        }
                    } else {
                        const errText = await aiRes.text().catch(() => "");
                        lastErrorMessage = `Model ${modelName} returned HTTP ${aiRes.status}: ${errText.slice(0, 200)}`;
                    }
                } catch (err: any) {
                    lastErrorMessage = `Model ${modelName} call failed: ${err.message}`;
                }
            }

            // Fallback to chat completions endpoint if native calls did not succeed
            if (!parsedResult) {
                const headers: Record<string, string> = {
                    "Authorization": `Bearer ${aiConfig.apiKey}`,
                    "Content-Type": "application/json",
                    "x-goog-api-key": aiConfig.apiKey
                };

                const fallbackRes = await fetch(aiConfig.endpoint, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        model: aiConfig.model || "gemini-3.5-flash",
                        messages: [
                            { role: "system", content: systemInstruction },
                            { role: "user", content: userPrompt }
                        ],
                        temperature: 0.2,
                        max_tokens: 3000
                    })
                });

                if (fallbackRes.ok) {
                    const fallbackData = await fallbackRes.json();
                    const contentStr = fallbackData?.choices?.[0]?.message?.content?.trim() || "";
                    parsedResult = parseJsonFromAi(contentStr);
                } else {
                    throw new Error(lastErrorMessage || "All Gemini models were unavailable. Please try again in a few moments.");
                }
            }
        } else {
            // OpenAI, OpenRouter, Custom
            const headers: Record<string, string> = {
                "Authorization": `Bearer ${aiConfig.apiKey}`,
                "Content-Type": "application/json",
            };

            const aiRes = await fetch(aiConfig.endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: aiConfig.model,
                    messages: [
                        { role: "system", content: systemInstruction },
                        { role: "user", content: userPrompt }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.2,
                    max_tokens: 3000
                })
            });

            if (!aiRes.ok) {
                const errBody = await aiRes.text().catch(() => "");
                throw new Error(`AI Extraction Failed (HTTP ${aiRes.status}): ${errBody.slice(0, 300)}`);
            }

            const aiData = await aiRes.json();
            const contentStr = aiData?.choices?.[0]?.message?.content?.trim() || "";
            parsedResult = parseJsonFromAi(contentStr);
        }

        const entries = (parsedResult?.entries || []).map((e: any) => ({
            category: (e.category || "GENERAL").toUpperCase(),
            title: (e.title || "Untitled Item").trim().slice(0, 190),
            content: (e.content || "").trim(),
            sourceUrl: targetUrl,
            isVerified: true
        })).filter((e: any) => e.content.length > 5);

        // Optionally update tenant profile if businessInfo was found
        const bInfo = parsedResult?.businessInfo;
        if (bInfo) {
            const updates: any = {};
            if (bInfo.phone && !context.tenant.phone) updates.phone = bInfo.phone;
            if (bInfo.email && !context.tenant.email) updates.email = bInfo.email;
            if (bInfo.address && !context.tenant.address) updates.address = bInfo.address;
            if (bInfo.description && !context.tenant.description) updates.description = bInfo.description;
            if (bInfo.openingHours && !context.tenant.businessHours) {
                updates.businessHours = { summary: bInfo.openingHours };
            }
            if (Object.keys(updates).length > 0) {
                await prisma.tenant.update({
                    where: { id: context.tenant.id },
                    data: updates
                }).catch(() => {});
            }
        }

        await recordAuditLog({
            tenantId: context.tenant.id,
            userId: context.user.id,
            action: "KNOWLEDGE_WEBSITE_SCRAPED",
            resource: `Website:${targetUrl}`,
            details: { url: targetUrl, extractedCount: entries.length },
            request
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: `Successfully extracted ${entries.length} items from website`,
            data: {
                url: targetUrl,
                businessInfo: bInfo,
                entries
            }
        });

    } catch (error: any) {
        console.error("Scrape Knowledge Error:", error);
        return NextResponse.json({
            success: false,
            message: error.message || "Failed to scrape website",
            error: error.message
        }, { status: 500 });
    }
}
