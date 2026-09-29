import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        // @ts-ignore
        const config = await prisma.systemConfig.findUnique({
            where: { id: "default" }
        });

        return NextResponse.json({ status: true, message: "System config fetched", data: config || { appName: "WA-AKG", faviconUrl: "/favicon.ico" } });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to fetch settings", error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        // @ts-ignore
        const user = await getAuthenticatedUser(req);
        if (!user || user.role !== "SUPERADMIN") {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { 
            appName, 
            baseUrl, 
            logoUrl, 
            faviconUrl, 
            timezone, 
            enableRegistration,
            aiProvider,
            aiApiKey,
            aiModel,
            aiSystemPrompt
        } = body;

        const updateData: any = {
            appName,
            logoUrl,
            faviconUrl,
            timezone,
            enableRegistration: enableRegistration ?? true,
        };

        if (baseUrl !== undefined) updateData.baseUrl = baseUrl?.trim() ? baseUrl.trim().replace(/\/$/, "") : null;
        if (aiProvider !== undefined) updateData.aiProvider = aiProvider;
        if (aiApiKey !== undefined) updateData.aiApiKey = aiApiKey;
        if (aiModel !== undefined) updateData.aiModel = aiModel;
        if (aiSystemPrompt !== undefined) updateData.aiSystemPrompt = aiSystemPrompt;

        const config = await prisma.systemConfig.upsert({
            where: { id: "default" },
            update: updateData,
            create: {
                id: "default",
                appName: appName || "WA-AKG",
                baseUrl: baseUrl?.trim() ? baseUrl.trim().replace(/\/$/, "") : null,
                logoUrl: logoUrl || "",
                faviconUrl: faviconUrl || "/favicon.ico",
                timezone: timezone || "Asia/Jakarta",
                enableRegistration: enableRegistration ?? true,
                aiProvider: aiProvider || "gemini",
                aiApiKey: aiApiKey || null,
                aiModel: aiModel || "gemini-2.5-flash",
                aiSystemPrompt: aiSystemPrompt || null,
            }
        });

        // Invalidate in-memory AI cache so new AI key/model/prompt apply immediately
        const { invalidateSystemAiConfigCache } = await import("@/modules/whatsapp/bot/ai-reply");
        invalidateSystemAiConfigCache();

        return NextResponse.json({ status: true, message: "System settings updated successfully", data: config });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to update settings", error: "Failed to update settings" }, { status: 500 });
    }
}
