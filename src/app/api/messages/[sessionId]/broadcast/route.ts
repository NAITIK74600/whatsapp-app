import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/modules/whatsapp/manager";
import { antispam } from "@/modules/whatsapp/antispam";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { z } from "zod";

const broadcastBodySchema = z.object({
    recipients: z.array(z.string()),
    message: z.string().min(1),
    delay: z.number().optional()
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId } = await params;
        const body = await request.json();

        const parseResult = broadcastBodySchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
        }

        const { recipients, message, delay } = parseResult.data;

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ status: false, message: "Session not ready", error: "Session not ready" }, { status: 503 });
        }

        // --- Save BroadcastLog & recipients to DB ---
        const log = await prisma.broadcastLog.create({
            data: {
                sessionId,
                message,
                total: recipients.length,
                delay: delay || 2000,
                status: "running",
                recipients: {
                    create: recipients.map(jid => ({
                        jid,
                        status: "pending"
                    }))
                }
            },
            include: { recipients: true }
        });

        const messageContent: AnyMessageContent = { text: message };
        const io = (global as any).io;
        const broadcastId = log.id;

        // Emit initial state
        if (io) {
            io.to(sessionId).emit("broadcast.progress", {
                broadcastId,
                status: "running",
                total: recipients.length,
                sent: 0,
                failed: 0,
                current: null,
                progress: 0,
                startedAt: log.startedAt.toISOString()
            });
        }

        // Process in background with safety checks, bounce protection, and breather delays
        (async () => {
            let sent = 0;
            let failed = 0;
            const errors: { jid: string; error: string }[] = [];

            // Pre-fetch session bot config to check opt-outs & safety
            const sessionData = await prisma.session.findUnique({
                where: { sessionId },
                select: { botConfig: true }
            });
            const blockedJids = Array.isArray(sessionData?.botConfig?.botBlockedJids)
                ? (sessionData!.botConfig!.botBlockedJids as string[])
                : [];
            const autoOptOut = sessionData?.botConfig?.autoOptOut ?? true;

            for (let i = 0; i < recipients.length; i++) {
                const jid = recipients[i];

                // 1. Safety Check: Filter Opted-Out Contacts
                if (autoOptOut && blockedJids.includes(jid)) {
                    failed++;
                    const reason = "Skipped: recipient previously requested opt-out (STOP)";
                    errors.push({ jid, error: reason });
                    await prisma.broadcastRecipient.updateMany({
                        where: { broadcastLogId: broadcastId, jid },
                        data: { status: "failed", error: reason }
                    });
                    continue;
                }

                // 2. Safety Check: Verify Number on WhatsApp (Prevent Bounce Rate Ban)
                if (instance.socket && typeof instance.socket.onWhatsApp === "function" && jid.endsWith("@s.whatsapp.net")) {
                    try {
                        const cleanPhone = jid.replace("@s.whatsapp.net", "");
                        const checkResults = await instance.socket.onWhatsApp(cleanPhone);
                        const checkResult = Array.isArray(checkResults) ? checkResults[0] : null;
                        if (!checkResult || !checkResult.exists) {
                            failed++;
                            const reason = "Skipped: phone number is not registered on WhatsApp";
                            errors.push({ jid, error: reason });
                            await prisma.broadcastRecipient.updateMany({
                                where: { broadcastLogId: broadcastId, jid },
                                data: { status: "failed", error: reason }
                            });
                            continue;
                        }
                    } catch {
                        // Verification failure non-fatal, proceed
                    }
                }

                // 3. Human Presence Simulation (Typing...)
                try {
                    const textLen = (messageContent.text || "").length;
                    await antispam.simulateHumanPresence(instance.socket, jid, textLen);
                } catch { }

                try {
                    await instance.socket!.sendMessage(jid, messageContent);
                    sent++;

                    // Update recipient status in DB
                    await prisma.broadcastRecipient.updateMany({
                        where: { broadcastLogId: broadcastId, jid },
                        data: { status: "sent", sentAt: new Date() }
                    });
                } catch (e: any) {
                    failed++;
                    errors.push({ jid, error: e.message || "Unknown error" });
                    console.error(`Failed to send broadcast to ${jid}`, e);

                    // Update recipient error in DB
                    await prisma.broadcastRecipient.updateMany({
                        where: { broadcastLogId: broadcastId, jid },
                        data: { status: "failed", error: e.message || "Unknown error" }
                    });
                }

                const progress = Math.round(((sent + failed) / recipients.length) * 100);

                // Update BroadcastLog progress in DB
                await prisma.broadcastLog.update({
                    where: { id: broadcastId },
                    data: { sent, failed }
                });

                // Socket real-time
                if (io) {
                    io.to(sessionId).emit("broadcast.progress", {
                        broadcastId,
                        status: "running",
                        total: recipients.length,
                        sent,
                        failed,
                        current: jid,
                        progress
                    });
                }

                // Delay between sends with random jitter & breather pause
                if (i < recipients.length - 1) {
                    // Safe minimum delay: at least 2500ms + random jitter
                    const baseDelay = Math.max(delay || 3000, 2500);
                    const randomDelay = baseDelay + Math.floor(Math.random() * 2000);
                    let finalDelay = randomDelay;

                    // Breather Pause: After every 15 messages, apply a 15-second cooling breather to mimic human rhythm
                    if ((i + 1) % 15 === 0) {
                        console.log(`[Safety] Breather cooldown (15s) applied after sending ${i + 1} broadcast messages.`);
                        finalDelay += 15000;
                    }

                    await new Promise(r => setTimeout(r, finalDelay));
                }
            }

            // Mark as completed in DB
            await prisma.broadcastLog.update({
                where: { id: broadcastId },
                data: { status: "completed", sent, failed, completedAt: new Date() }
            });

            // Final socket emit
            if (io) {
                io.to(sessionId).emit("broadcast.progress", {
                    broadcastId,
                    status: "completed",
                    total: recipients.length,
                    sent,
                    failed,
                    errors,
                    progress: 100,
                    completedAt: new Date().toISOString()
                });
            }
            console.log(`Broadcast ${broadcastId} completed: ${sent} sent, ${failed} failed out of ${recipients.length}`);
        })();

        return NextResponse.json({
            status: true,
            message: "Broadcast started",
            data: { broadcastId: log.id, total: recipients.length }
        });

    } catch (e) {
        console.error("Broadcast error", e);
        return NextResponse.json({ status: false, message: "Failed to start broadcast", error: "Failed to start broadcast" }, { status: 500 });
    }
}
