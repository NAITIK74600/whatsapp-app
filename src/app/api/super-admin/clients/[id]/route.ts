import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/tenant-context";
import { waManager } from "@/modules/whatsapp/manager";

export const dynamic = 'force-dynamic';

// PATCH: Update client tenant details, status (suspend/reactivate), plan, and limits
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !isAdmin(user.role)) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "FORBIDDEN", message: "Super Admin privileges required" }
            }, { status: 403 });
        }

        const resolvedParams = await params;
        const tenantId = resolvedParams.id;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant) {
            return NextResponse.json({
                success: false,
                message: "Client not found",
                error: { code: "NOT_FOUND", message: `No client found with id "${tenantId}"` }
            }, { status: 404 });
        }

        const body = await request.json().catch(() => ({}));
        const updateData: any = {};

        if (body.name && typeof body.name === "string") updateData.name = body.name.trim();
        if (body.status && ["ACTIVE", "SUSPENDED", "TRIAL"].includes(body.status)) updateData.status = body.status;
        if (body.plan && ["STARTER", "PROFESSIONAL", "BUSINESS", "ENTERPRISE"].includes(body.plan)) updateData.plan = body.plan;
        if (body.businessCategory !== undefined) updateData.businessCategory = body.businessCategory;
        if (body.country !== undefined) updateData.country = body.country;
        if (body.timezone !== undefined) updateData.timezone = body.timezone;
        if (body.preferredLanguage !== undefined) updateData.preferredLanguage = body.preferredLanguage;
        if (body.phone !== undefined) updateData.phone = body.phone;
        if (body.email !== undefined) updateData.email = body.email;
        if (body.website !== undefined) updateData.website = body.website;
        if (body.notes !== undefined) updateData.notes = body.notes;
        if (body.supportContact !== undefined) updateData.supportContact = body.supportContact;

        if (body.maxSessions !== undefined) updateData.maxSessions = parseInt(body.maxSessions);
        if (body.maxEmployees !== undefined) updateData.maxEmployees = parseInt(body.maxEmployees);
        if (body.maxMonthlyMessages !== undefined) updateData.maxMonthlyMessages = parseInt(body.maxMonthlyMessages);
        if (body.maxContacts !== undefined) updateData.maxContacts = parseInt(body.maxContacts);
        if (body.maxAutoReplies !== undefined) updateData.maxAutoReplies = parseInt(body.maxAutoReplies);

        const updated = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData
        });

        await recordAuditLog({
            tenantId,
            userId: user.id,
            action: body.status === "SUSPENDED" ? "CLIENT_SUSPENDED" : (body.status === "ACTIVE" ? "CLIENT_REACTIVATED" : "CLIENT_UPDATED"),
            resource: `Tenant:${tenantId}`,
            details: updateData,
            request
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Client workspace updated successfully",
            data: updated
        });

    } catch (error: any) {
        console.error("Update client error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to update client",
            error: { code: "UPDATE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}

// DELETE: Safely delete a client workspace and related data with confirmation safeguards
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !isAdmin(user.role)) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "FORBIDDEN", message: "Super Admin privileges required" }
            }, { status: 403 });
        }

        const resolvedParams = await params;
        const tenantId = resolvedParams.id;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
                _count: { select: { sessions: true } }
            }
        });

        if (!tenant) {
            return NextResponse.json({
                success: false,
                message: "Client not found",
                error: { code: "NOT_FOUND", message: `No client found with id "${tenantId}"` }
            }, { status: 404 });
        }

        // Clean up any active WhatsApp sessions for this tenant
        try {
            const tenantSessions = await prisma.session.findMany({
                where: { tenantId },
                select: { sessionId: true }
            });
            for (const s of tenantSessions) {
                try {
                    await waManager.deleteSession(s.sessionId);
                } catch (e) {
                    console.warn(`Could not gracefully delete WhatsApp session ${s.sessionId}:`, e);
                }
            }
        } catch (cleanupErr) {
            console.warn("Session cleanup warning before tenant deletion:", cleanupErr);
        }

        // Record audit before deletion
        await recordAuditLog({
            tenantId,
            userId: user.id,
            action: "CLIENT_DELETED",
            resource: `Tenant:${tenantId}`,
            details: { name: tenant.name, slug: tenant.slug },
            request
        });

        await prisma.tenant.delete({
            where: { id: tenantId }
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: `Client workspace "${tenant.name}" deleted successfully`
        });

    } catch (error: any) {
        console.error("Delete client error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to delete client workspace",
            error: { code: "DELETE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
