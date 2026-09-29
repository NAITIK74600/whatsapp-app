import { NextResponse, NextRequest } from "next/server";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { resolveAiConfig } from "@/modules/whatsapp/bot/ai-reply";

export const dynamic = "force-dynamic";

function cleanHtml(html: string): string {
    let text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    text = text
        .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");

    return text
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join("\n")
        .slice(0, 40000);
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

        const cleanedText = cleanHtml(html);
        if (cleanedText.length < 50) {
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

        const aiConfig = resolveAiConfig(session?.botConfig);
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
Return ONLY valid JSON without markdown wrapping:
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

        const userPrompt = `Extract all products, services, opening hours, and business facts from this website (${targetUrl}):\n\n${cleanedText}`;

        const headers: Record<string, string> = {
            "Authorization": `Bearer ${aiConfig.apiKey}`,
            "Content-Type": "application/json",
        };

        if (aiConfig.isGemini) {
            headers["x-goog-api-key"] = aiConfig.apiKey;
        }

        const aiRes = await fetch(aiConfig.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 3000
            })
        });

        if (!aiRes.ok) {
            const errBody = await aiRes.text().catch(() => "");
            return NextResponse.json({
                success: false,
                message: `AI Extraction Failed (HTTP ${aiRes.status}): ${errBody.slice(0, 300)}`
            }, { status: 500 });
        }

        const aiData = await aiRes.json();
        const contentStr = aiData?.choices?.[0]?.message?.content?.trim() || "";

        let cleanJsonStr = contentStr;
        if (cleanJsonStr.startsWith("```")) {
            cleanJsonStr = cleanJsonStr.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
        }

        let parsedResult: any = null;
        try {
            parsedResult = JSON.parse(cleanJsonStr);
        } catch {
            // Fallback match for first JSON object
            const jsonMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("AI did not return valid JSON structure");
            }
        }

        const entries = (parsedResult?.entries || []).map((e: any) => ({
            category: (e.category || "GENERAL").toUpperCase(),
            title: e.title?.trim() || "Untitled Item",
            content: e.content?.trim() || "",
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
