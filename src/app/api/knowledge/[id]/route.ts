import { NextResponse, NextRequest } from "next/server";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
                error: { code: "FORBIDDEN", message: "You do not have permission to modify knowledge entries" }
            }, { status: 403 });
        }

        const resolvedParams = await params;
        const entryId = resolvedParams.id;

        const entry = await prisma.knowledgeEntry.findUnique({
            where: { id: entryId }
        });

        if (!entry || entry.tenantId !== context.tenant.id) {
            return NextResponse.json({
                success: false,
                message: "Entry not found in your workspace",
                error: { code: "NOT_FOUND", message: "Entry not found" }
            }, { status: 404 });
        }

        const body = await request.json().catch(() => ({}));
        const updateData: any = {};

        if (body.title && typeof body.title === "string") updateData.title = body.title.trim();
        if (body.content && typeof body.content === "string") updateData.content = body.content.trim();
        if (body.category && typeof body.category === "string") updateData.category = body.category.toUpperCase();
        if (body.isVerified !== undefined) updateData.isVerified = Boolean(body.isVerified);
        if (body.sourceUrl !== undefined) updateData.sourceUrl = body.sourceUrl?.trim() || null;

        const updated = await prisma.knowledgeEntry.update({
            where: { id: entryId },
            data: updateData
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Knowledge entry updated",
            data: updated
        });

    } catch (error: any) {
        console.error("Update knowledge entry error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to update entry",
            error: { code: "KNOWLEDGE_UPDATE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
                error: { code: "FORBIDDEN", message: "You do not have permission to delete knowledge entries" }
            }, { status: 403 });
        }

        const resolvedParams = await params;
        const entryId = resolvedParams.id;

        const entry = await prisma.knowledgeEntry.findUnique({
            where: { id: entryId }
        });

        if (!entry || entry.tenantId !== context.tenant.id) {
            return NextResponse.json({
                success: false,
                message: "Entry not found in your workspace",
                error: { code: "NOT_FOUND", message: "Entry not found" }
            }, { status: 404 });
        }

        await prisma.knowledgeEntry.delete({
            where: { id: entryId }
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Knowledge entry deleted successfully"
        });

    } catch (error: any) {
        console.error("Delete knowledge entry error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to delete entry",
            error: { code: "KNOWLEDGE_DELETE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
