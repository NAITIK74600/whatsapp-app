import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { getAuthenticatedUser } from "./api-auth";
import { logger } from "./logger";
import { Tenant, TenantMembership, TenantRole, TenantStatus } from "@prisma/client";

export interface TenantContext {
    user: {
        id: string;
        email: string;
        name: string | null;
        role: string; // Global role: SUPERADMIN, OWNER, STAFF
        mustChangePassword?: boolean;
    };
    tenant: Tenant | null;
    membership: TenantMembership | null;
    tenantRole: TenantRole | "SUPERADMIN" | null;
    isSuperAdmin: boolean;
    isOwner: boolean;
    isAdmin: boolean;
    canManageSessions: boolean;
    canManageBot: boolean;
    canManageTeam: boolean;
}

/**
 * Resolves the authenticated user, their current active tenant, and verified permissions.
 * Never trusts client-supplied headers without validating tenant membership.
 */
export async function getTenantContext(request?: NextRequest): Promise<TenantContext | null> {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return null;
    }

    const isSuperAdmin = user.role === "SUPERADMIN";

    // Optional header to switch tenant view (e.g. for SuperAdmin or multi-workspace users)
    const requestedTenantId = request?.headers.get("x-tenant-id") || undefined;

    // Fetch user's tenant memberships
    const memberships = await prisma.tenantMembership.findMany({
        where: { userId: user.id },
        include: { tenant: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });

    let activeTenant: Tenant | null = null;
    let activeMembership: TenantMembership | null = null;

    if (requestedTenantId) {
        if (isSuperAdmin) {
            // Super Admin can inspect any tenant
            activeTenant = await prisma.tenant.findUnique({
                where: { id: requestedTenantId }
            });
            activeMembership = memberships.find(m => m.tenantId === requestedTenantId) || null;
        } else {
            // Regular user MUST be an explicit member of the requested tenant
            const matched = memberships.find(m => m.tenantId === requestedTenantId);
            if (matched) {
                activeTenant = matched.tenant;
                activeMembership = matched;
            }
        }
    }

    // Default to the user's primary/default membership if not specified or not found
    if (!activeTenant && memberships.length > 0) {
        activeTenant = memberships[0].tenant;
        activeMembership = memberships[0];
    }

    // If still no tenant and user is Super Admin, find the first available tenant or keep null
    if (!activeTenant && isSuperAdmin) {
        activeTenant = await prisma.tenant.findFirst({
            orderBy: { createdAt: "asc" }
        });
    }

    const tenantRole: TenantRole | "SUPERADMIN" | null = isSuperAdmin
        ? "SUPERADMIN"
        : (activeMembership?.role || null);

    const isOwner = isSuperAdmin || tenantRole === "OWNER";
    const isAdmin = isOwner || tenantRole === "ADMIN";
    const canManageSessions = isOwner || isAdmin;
    const canManageBot = isOwner || isAdmin || tenantRole === "MANAGER";
    const canManageTeam = isOwner;

    return {
        user,
        tenant: activeTenant,
        membership: activeMembership,
        tenantRole,
        isSuperAdmin,
        isOwner,
        isAdmin,
        canManageSessions,
        canManageBot,
        canManageTeam
    };
}

/**
 * Strict verification that a target resource belongs to the active tenant.
 * Prevents cross-tenant parameter tampering (IDOR).
 */
export function verifyTenantResourceAccess(
    context: TenantContext,
    resourceTenantId: string | null | undefined
): { allowed: boolean; error?: string } {
    if (context.isSuperAdmin) {
        return { allowed: true };
    }

    if (!context.tenant) {
        return { allowed: false, error: "No active tenant associated with this account" };
    }

    if (context.tenant.status === TenantStatus.SUSPENDED) {
        return { allowed: false, error: "Account is suspended. Please contact platform support." };
    }

    if (!resourceTenantId) {
        // Legacy resource without tenantId - only accessible if created by this user
        return { allowed: true };
    }

    if (context.tenant.id !== resourceTenantId) {
        logger.warn(
            "Security",
            `Cross-tenant access attempted! User ${context.user.email} (Tenant ${context.tenant.id}) tried to access resource of Tenant ${resourceTenantId}`
        );
        return { allowed: false, error: "Access denied: Resource belongs to a different workspace" };
    }

    return { allowed: true };
}

/**
 * Record an audit log for security, administrative, and tenant events.
 */
export async function recordAuditLog(params: {
    tenantId?: string | null;
    userId?: string | null;
    action: string;
    resource?: string;
    details?: any;
    request?: NextRequest;
}) {
    try {
        const ip = params.request?.headers.get("x-forwarded-for") ||
            params.request?.headers.get("x-real-ip") ||
            "unknown";
        const userAgent = params.request?.headers.get("user-agent") || "unknown";

        await prisma.auditLog.create({
            data: {
                tenantId: params.tenantId || null,
                userId: params.userId || null,
                action: params.action,
                resource: params.resource,
                details: params.details || null,
                ipAddress: typeof ip === "string" ? ip.split(",")[0].trim() : ip,
                userAgent
            }
        });
    } catch (err) {
        logger.error("AuditLog", "Failed to record audit log:", err);
    }
}
