import { prisma } from "./prisma";
import { NextRequest } from "next/server";
import { auth } from "./auth";
import { logger } from "./logger";

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
    SUPERADMIN: 3,
    OWNER: 2,
    STAFF: 1
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

/**
 * Validate API key from request header
 */
export async function validateApiKey(request: NextRequest) {
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
        return null;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { apiKey },
            select: { id: true, email: true, name: true, role: true }
        });

        return user;
    } catch (error) {
        logger.error("Auth", "API key validation error:", error);
        return null;
    }
}

/**
 * Get authenticated user from either session or API key
 */
export async function getAuthenticatedUser(request?: NextRequest) {
    // First try API key if request is provided
    if (request) {
        const apiKeyUser = await validateApiKey(request);
        if (apiKeyUser) {
            return { ...apiKeyUser, authMethod: "apiKey" as const };
        }
    }

    // Fall back to session auth
    const session = await auth();
    if (session?.user?.id) {
        // Fetch full user data including role
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, email: true, name: true, role: true }
        });

        if (user) {
            return { ...user, authMethod: "session" as const };
        }
    }

    return null;
}

/**
 * Check if user has required role level
 */
export function hasRole(userRole: string, requiredRole: Role): boolean {
    const userLevel = ROLE_HIERARCHY[userRole as Role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

/**
 * Check if user is admin (SUPERADMIN or has admin privileges)
 */
export function isAdmin(userRole: string): boolean {
    return userRole === "SUPERADMIN";
}

/**
 * Check if user can access a session
 * - SUPERADMIN can access all sessions
 * - Tenant members can access sessions belonging to their tenant
 * - Direct session owners or shared users can access their sessions
 */
export async function canAccessSession(
    userId: string,
    userRole: string,
    sessionId: string,
    tenantId?: string
): Promise<boolean> {
    if (isAdmin(userRole)) {
        return true;
    }

    const session = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId },
                { sessionId: sessionId }
            ]
        },
        select: { id: true, userId: true, tenantId: true }
    });

    if (!session) return false;

    // Check tenant membership if session belongs to a tenant
    if (session.tenantId) {
        if (tenantId && session.tenantId !== tenantId) {
            return false;
        }
        const membership = await prisma.tenantMembership.findUnique({
            where: {
                tenantId_userId: {
                    tenantId: session.tenantId,
                    userId
                }
            }
        });
        if (membership) return true;
    }

    // Direct owner check
    if (session.userId === userId) return true;

    // Check if user has shared access
    const sharedAccess = await prisma.sessionAccess.findUnique({
        where: {
            sessionId_userId: {
                sessionId: session.id,
                userId
            }
        }
    });

    return !!sharedAccess;
}

/**
 * Check if user is an owner or admin of a session (or tenant owner)
 */
export async function isSessionOwner(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (isAdmin(userRole)) {
        return true;
    }

    const session = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId },
                { sessionId: sessionId }
            ]
        },
        select: { id: true, userId: true, tenantId: true }
    });

    if (!session) return false;

    if (session.tenantId) {
        const membership = await prisma.tenantMembership.findUnique({
            where: {
                tenantId_userId: {
                    tenantId: session.tenantId,
                    userId
                }
            }
        });
        if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
            return true;
        }
    }

    return session.userId === userId;
}

/**
 * Get sessions that user can access
 * - SUPERADMIN sees all (or filtered by tenantId if specified)
 * - Tenant members see their tenant's sessions
 * - Direct owners see their sessions
 */
export async function getAccessibleSessions(userId: string, userRole: string, tenantId?: string) {
    if (isAdmin(userRole)) {
        const whereClause: any = {};
        if (tenantId) {
            whereClause.tenantId = tenantId;
        }
        return prisma.session.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        name: true,
                        email: true
                    }
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        slug: true
                    }
                },
                botConfig: true,
                webhooks: true,
                _count: {
                    select: {
                        contacts: true,
                        messages: true,
                        groups: true,
                        autoReplies: true,
                        scheduledMessages: true
                    }
                }
            }
        });
    }

    // Find tenants user is a member of
    const memberships = await prisma.tenantMembership.findMany({
        where: { userId },
        select: { tenantId: true }
    });
    const userTenantIds = memberships.map(m => m.tenantId);

    let whereClause: any;
    if (tenantId && userTenantIds.includes(tenantId)) {
        whereClause = { tenantId };
    } else if (userTenantIds.length > 0) {
        whereClause = {
            OR: [
                { tenantId: { in: userTenantIds } },
                { userId }
            ]
        };
    } else {
        whereClause = { userId };
    }

    return prisma.session.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
            user: {
                select: {
                    name: true,
                    email: true
                }
            },
            tenant: {
                select: {
                    id: true,
                    name: true,
                    slug: true
                }
            },
            botConfig: true,
            webhooks: true,
            _count: {
                select: {
                    contacts: true,
                    messages: true,
                    groups: true,
                    autoReplies: true,
                    scheduledMessages: true
                }
            }
        }
    });
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "wag_"; // Prefix for easy identification
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
