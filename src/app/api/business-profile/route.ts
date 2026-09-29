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

        const tenant = await prisma.tenant.findUnique({
            where: { id: context.tenant.id },
            include: {
                _count: {
                    select: {
                        sessions: true,
                        memberships: true,
                        knowledgeEntries: true
                    }
                }
            }
        });

        return NextResponse.json({
            success: true,
            status: true,
            data: tenant
        });
    } catch (error: any) {
        console.error("Get business profile error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to fetch business profile",
            error: { code: "PROFILE_FETCH_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
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

        if (!context.isOwner && !context.isAdmin) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Forbidden",
                error: { code: "FORBIDDEN", message: "Only workspace owners or admins can modify business profiles" }
            }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const {
            name,
            businessCategory,
            description,
            address,
            country,
            timezone,
            preferredLanguage,
            phone,
            email,
            website,
            businessHours,
            supportContact
        } = body;

        const updateData: any = {};
        if (name && typeof name === "string") updateData.name = name.trim();
        if (businessCategory !== undefined) updateData.businessCategory = businessCategory;
        if (description !== undefined) updateData.description = description;
        if (address !== undefined) updateData.address = address;
        if (country !== undefined) updateData.country = country;
        if (timezone !== undefined) updateData.timezone = timezone;
        if (preferredLanguage !== undefined) updateData.preferredLanguage = preferredLanguage;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (website !== undefined) updateData.website = website;
        if (businessHours !== undefined) updateData.businessHours = businessHours;
        if (supportContact !== undefined) updateData.supportContact = supportContact;

        const updated = await prisma.tenant.update({
            where: { id: context.tenant.id },
            data: updateData
        });

        await recordAuditLog({
            tenantId: context.tenant.id,
            userId: context.user.id,
            action: "BUSINESS_PROFILE_UPDATED",
            resource: `Tenant:${context.tenant.id}`,
            details: updateData,
            request
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Business profile updated successfully",
            data: updated
        });

    } catch (error: any) {
        console.error("Update business profile error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to update business profile",
            error: { code: "PROFILE_UPDATE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
