import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface HandoffAlertParams {
    sessionId: string;
    tenantId?: string | null;
    customerJid: string;
    customerName?: string | null;
    reason: string;
    snippet: string;
}

/**
 * Creates in-app notifications and emits real-time alerts when a customer requests
 * human assistance, asks about payment/contract, or triggers AI escalation.
 */
export async function sendHandoffNotification({
    sessionId,
    tenantId,
    customerJid,
    customerName,
    reason,
    snippet,
}: HandoffAlertParams) {
    try {
        const cleanNumber = customerJid.replace(/@.+/, "").replace(/\D/g, "");
        const displayName = customerName || `+${cleanNumber}`;
        const chatHref = `/dashboard/chat/${cleanNumber}`;

        const targetUserIds = new Set<string>();

        // 1. Session owner
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { userId: true, tenantId: true }
        });
        if (session?.userId) {
            targetUserIds.add(session.userId);
        }

        // 2. Tenant members / employees
        const resolvedTenantId = tenantId || session?.tenantId;
        if (resolvedTenantId) {
            const memberships = await prisma.tenantMembership.findMany({
                where: { tenantId: resolvedTenantId },
                select: { userId: true }
            });
            memberships.forEach(m => targetUserIds.add(m.userId));
        }

        if (targetUserIds.size === 0) {
            // Fallback to first available admin
            const adminUser = await prisma.user.findFirst({
                where: { role: { in: ["SUPERADMIN", "OWNER"] } },
                select: { id: true }
            });
            if (adminUser) targetUserIds.add(adminUser.id);
        }

        const title = `🚨 Human Advisor Needed: ${displayName}`;
        const message = `${reason}\nCustomer: "${snippet.slice(0, 160)}"`;

        const io = (global as any).io;

        for (const userId of targetUserIds) {
            const notif = await prisma.notification.create({
                data: {
                    userId,
                    title,
                    message,
                    type: "WARNING",
                    href: chatHref,
                    read: false,
                }
            });

            if (io) {
                io.to(`user:${userId}`).emit("notification:new", {
                    id: notif.id,
                    userId,
                    title,
                    message,
                    type: "WARNING",
                    href: chatHref,
                    createdAt: notif.createdAt.toISOString(),
                    read: false,
                });
            }
        }

        logger.info("Escalation", `Dispatched human handoff notification for ${customerJid} to ${targetUserIds.size} users`);
    } catch (err: any) {
        logger.error("Escalation", "Failed to dispatch handoff notification:", err?.message || err);
    }
}
