import { NextResponse, NextRequest } from "next/server";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const context = await getTenantContext(request);
        if (!context || !context.tenant) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "No active tenant found",
                error: { code: "NO_TENANT", message: "No active workspace associated with account" }
            }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const category = searchParams.get("category");
        const search = searchParams.get("search");

        const where: any = { tenantId: context.tenant.id };
        if (category && category !== "ALL") where.category = category;
        if (search) {
            where.OR = [
                { title: { contains: search } },
                { content: { contains: search } }
            ];
        }

        const entries = await prisma.knowledgeEntry.findMany({
            where,
            orderBy: [{ category: "asc" }, { createdAt: "desc" }]
        });

        return NextResponse.json({
            success: true,
            status: true,
            data: entries
        });
    } catch (error: any) {
        console.error("Get knowledge entries error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to fetch knowledge base",
            error: { code: "KNOWLEDGE_FETCH_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const context = await getTenantContext(request);
        if (!context || !context.tenant) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "No active tenant found",
                error: { code: "NO_TENANT", message: "No active workspace associated with account" }
            }, { status: 400 });
        }

        if (!context.canManageBot) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden",
                error: { code: "FORBIDDEN", message: "You do not have permission to manage the knowledge base" }
            }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const { category = "FAQ", title, content, isVerified = true, sourceUrl } = body;

        if (!title || typeof title !== "string" || !title.trim()) {
            return NextResponse.json({
                success: false,
                message: "Title is required",
                error: { code: "VALIDATION_ERROR", message: "Title is required" }
            }, { status: 400 });
        }

        if (!content || typeof content !== "string" || !content.trim()) {
            return NextResponse.json({
                success: false,
                message: "Content description is required",
                error: { code: "VALIDATION_ERROR", message: "Content description is required" }
            }, { status: 400 });
        }

        const entry = await prisma.knowledgeEntry.create({
            data: {
                tenantId: context.tenant.id,
                category: category.toUpperCase(),
                title: title.trim(),
                content: content.trim(),
                isVerified: Boolean(isVerified),
                sourceUrl: sourceUrl?.trim() || null
            }
        });

        await recordAuditLog({
            tenantId: context.tenant.id,
            userId: context.user.id,
            action: "KNOWLEDGE_ENTRY_CREATED",
            resource: `Knowledge:${entry.id}`,
            details: { title: entry.title, category: entry.category },
            request
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Knowledge entry added successfully",
            data: entry
        }, { status: 201 });

    } catch (error: any) {
        console.error("Create knowledge entry error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to add knowledge entry",
            error: { code: "KNOWLEDGE_CREATE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
