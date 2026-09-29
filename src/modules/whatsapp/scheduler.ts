import { prisma } from "@/lib/prisma";
import { waManager } from "./manager";
import { logger } from "@/lib/logger";

const checkScheduledMessages = async () => {
    try {
        const now = new Date();
        logger.debug("Scheduler", `Checking for messages due before ${now.toISOString()}...`);

        const pendingMessages = await prisma.scheduledMessage.findMany({
            where: {
                status: "PENDING",
                sendAt: { lte: now }
            },
            include: {
                session: {
                    select: { id: true, sessionId: true }
                }
            }
        });

        if (pendingMessages.length > 0) {
            logger.info("Scheduler", `Found ${pendingMessages.length} pending scheduled messages to process.`);
        }

        for (const msg of pendingMessages) {
            // Support both session.sessionId and direct msg.sessionId
            const targetSessionId = msg.session?.sessionId || msg.sessionId;
            const instance = waManager.getInstance(targetSessionId);

            if (instance?.socket && instance.status === "CONNECTED") {
                try {
                    let content: any = {};
                    if (msg.mediaUrl) {
                        const url = msg.mediaUrl;
                        const type = msg.mediaType || 'image';

                        const res = await fetch(url);
                        if (!res.ok) throw new Error(`Failed to fetch media from URL: ${res.status} ${res.statusText}`);
                        const buffer = Buffer.from(await res.arrayBuffer());

                        if (type === 'video') {
                            content = { video: buffer, caption: msg.content || undefined };
                        } else if (type === 'document') {
                            content = { document: buffer, caption: msg.content || undefined, fileName: url.split('/').pop() || 'file', mimetype: 'application/octet-stream' };
                        } else {
                            content = { image: buffer, caption: msg.content || undefined };
                        }
                    } else {
                        content = { text: msg.content };
                    }

                    await instance.socket.sendMessage(msg.jid, content);

                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: { status: "SENT" }
                    });
                    logger.success("Scheduler", `Scheduled msg ${msg.id} sent to ${msg.jid}`);

                } catch (err) {
                    logger.error("Scheduler", `Failed to send scheduled msg ${msg.id}:`, err);
                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: { status: "FAILED" }
                    });
                }
            } else {
                logger.warn("Scheduler", `Session "${targetSessionId}" not connected for scheduled msg ${msg.id}. Will retry next check.`);
            }
        }
    } catch (e) {
        logger.error("Scheduler", "Error executing scheduler loop:", e);
    }
};

let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler() {
    if (schedulerInterval) return;
    logger.info("Scheduler", "Starting Message Scheduler worker (30s interval)...");

    // Run first check after short delay
    setTimeout(checkScheduledMessages, 5000);

    // Then run every 30 seconds
    schedulerInterval = setInterval(checkScheduledMessages, 30 * 1000);
}
