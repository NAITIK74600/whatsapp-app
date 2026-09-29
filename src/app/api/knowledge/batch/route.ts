import { NextResponse, NextRequest } from "next/server";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
        const rawEntries = Array.isArray(body.entries) ? body.entries : [];

        if (rawEntries.length === 0) {
            return NextResponse.json({
                success: false,
                message: "No entries provided to import"
            }, { status: 400 });
        }

        const tenantId = context.tenant.id;

        const validEntries = rawEntries
            .filter((e: any) => e.title?.trim() && e.content?.trim())
            .map((e: any) => ({
                tenantId,
                category: (e.category || "GENERAL").toUpperCase(),
                title: e.title.trim().slice(0, 190),
                content: e.content.trim(),
                sourceUrl: e.sourceUrl?.trim() || null,
                isVerified: e.isVerified !== undefined ? Boolean(e.isVerified) : true
            }));

        if (validEntries.length === 0) {
            return NextResponse.json({
                success: false,
                message: "No valid entries found with title and content"
            }, { status: 400 });
        }

        await prisma.knowledgeEntry.createMany({
            data: validEntries
        });

        await recordAuditLog({
            tenantId: context.tenant.id,
            userId: context.user.id,
            action: "KNOWLEDGE_BATCH_IMPORTED",
            resource: `Tenant:${context.tenant.id}`,
            details: { count: validEntries.length },
            request
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: `Successfully imported ${validEntries.length} knowledge entries`,
            data: { importedCount: validEntries.length }
        });

    } catch (error: any) {
        console.error("Batch Import Knowledge Error:", error);
        return NextResponse.json({
            success: false,
            message: error.message || "Failed to batch import knowledge entries",
            error: error.message
        }, { status: 500 });
    }
}
