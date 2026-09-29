import { prisma } from "@/lib/prisma";
import type { WASocket } from "@whiskeysockets/baileys";
import { normalizeMessageContent } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";
import { generateAiReply, isAiConfigured } from "@/modules/whatsapp/bot/ai-reply";

// Helper for permission check (Deduplicate from command-handler if possible, but keep simple here)
function canAutoReply(config: any, fromMe: boolean, senderJid: string): boolean {
    if (!config || !config.enabled) return false;

    // Auto Reply Specific Mode
    const mode = config.autoReplyMode || 'ALL';

    if (fromMe) {
        // If mode is OWNER, it triggers for ME? 
        // Auto Reply usually replies TO someone. 
        // If I send a message, and mode is OWNER, should it reply to me? 
        // User requested "Self Mode" -> Use case: Snippets.
        // So yes, if fromMe checks out.

        // However, standard auto-reply logic (replying to incoming) should be blocked if fromMe is true AND mode is ALL?
        // No, typically Auto Reply doesn't trigger on own messages to prevent unexpected loops.
        // But for "Self Mode" (Macros), it MUST trigger on own messages.

        if (mode === 'OWNER') return true;
        if (mode === 'ALL') return false; // Standard auto-reply ignores self

        // Specific? 
        return false;
    } else {
        // Incoming message from others
        if (mode === 'OWNER') return false; // Owner only acts on Owner messages
        if (mode === 'ALL') return true;

        if (mode === 'SPECIFIC') {
            const allowedJids = config.autoReplyAllowedJids || [];
            if (Array.isArray(allowedJids)) {
                return allowedJids.some((jid: string) => senderJid.includes(jid));
            }
        }

        if (mode === 'BLACKLIST') {
            const blockedJids = config.autoReplyBlockedJids || [];
            if (Array.isArray(blockedJids)) {
                const isBlocked = blockedJids.some((jid: string) => senderJid.includes(jid));
                return !isBlocked; // Return true if NOT blocked
            }
            return true; // If blacklist empty, allow all
        }
    }

    return false;
}

export async function bindAutoReply(sock: WASocket, sessionId: string) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        // Fetch session ID and Bot Config once per batch (optimization)
        const session = await prisma.session.findUnique({
            where: { sessionId },
            // @ts-ignore
            include: { botConfig: true }
        });

        if (!session) return;

        // @ts-ignore
        let config = (session as any).botConfig;

        if (!config) {
            logger.warn("AutoReply", "No config found, creating default...");
            config = await prisma.botConfig.create({
                data: {
                    sessionId: session.id,
                    enabled: true,
                    botMode: 'OWNER',
                    autoReplyMode: 'ALL'
                }
            });
        }

        logger.debug("AutoReply", `Processing for ${sessionId}. Config: ${config ? "Found" : "Missing"}, ${config?.enabled ? "Enabled" : "Disabled"}`);

        if (!config || !config.enabled) return;

        for (const msg of messages) {
            const fromMe = msg.key.fromMe || false;
            const remoteJid = msg.key.remoteJid;

            // Standardized Sender Logic
            const isGroup = remoteJid?.endsWith("@g.us") || false;
            const remoteJidAlt = msg.key.remoteJidAlt;
            let senderJid = (isGroup ? (msg.key.participant || msg.participant) : remoteJid);

            if (!isGroup && remoteJidAlt) {
                senderJid = remoteJidAlt;
            }

            if (!remoteJid || !senderJid) continue;

            // Check Permissions
            if (!canAutoReply(config, fromMe, senderJid)) continue;

            const content = normalizeMessageContent(msg.message);
            const text = content?.conversation || content?.extendedTextMessage?.text || ""; // Caption?

            if (!text) continue;

            // --- Automatic Safety & Compliance Opt-Out Handling ---
            const trimmedUpper = text.trim().toUpperCase();
            const optOutKeywords = ["STOP", "UNSUBSCRIBE", "BERHENTI", "BATAL", "CANCEL", "OPTOUT", "OPT OUT", "KELUAR"];
            const resubscribeKeywords = ["START", "SUBSCRIBE", "DAFTAR", "MULAI", "LANJUT", "UNBLOCK"];

            if (config.autoOptOut !== false && !isGroup && optOutKeywords.includes(trimmedUpper)) {
                try {
                    const currentBlocked: string[] = Array.isArray(config.botBlockedJids) ? [...config.botBlockedJids] : [];
                    if (!currentBlocked.includes(senderJid)) {
                        currentBlocked.push(senderJid);
                        await prisma.botConfig.update({
                            where: { id: config.id },
                            data: {
                                botBlockedJids: currentBlocked,
                                autoReplyBlockedJids: currentBlocked
                            }
                        });
                        config.botBlockedJids = currentBlocked;
                        logger.info("Safety", `Contact ${senderJid} opted out of automated messages on session ${sessionId}`);
                        await sock.sendMessage(remoteJid, {
                            text: "✅ You have been unsubscribed from automated messages and broadcasts. Reply START to resubscribe at any time."
                        }, { quoted: msg });
                    }
                } catch (optErr) {
                    logger.error("Safety", "Error handling opt-out:", optErr);
                }
                continue;
            }

            if (config.autoOptOut !== false && !isGroup && resubscribeKeywords.includes(trimmedUpper)) {
                try {
                    const currentBlocked: string[] = Array.isArray(config.botBlockedJids) ? [...config.botBlockedJids] : [];
                    if (currentBlocked.includes(senderJid)) {
                        const updated = currentBlocked.filter((j: string) => j !== senderJid);
                        await prisma.botConfig.update({
                            where: { id: config.id },
                            data: {
                                botBlockedJids: updated,
                                autoReplyBlockedJids: updated
                            }
                        });
                        config.botBlockedJids = updated;
                        logger.info("Safety", `Contact ${senderJid} resubscribed to automated messages on session ${sessionId}`);
                        await sock.sendMessage(remoteJid, {
                            text: "✅ You have been resubscribed to automated messages. Welcome back!"
                        }, { quoted: msg });
                    }
                } catch (subErr) {
                    logger.error("Safety", "Error handling resubscribe:", subErr);
                }
                continue;
            }

            try {
                // Fetch rules for this session
                const rules = await prisma.autoReply.findMany({
                    where: {
                        session: {
                            sessionId: sessionId
                        }
                    }
                });

                let matchedRule = false;

                for (const rule of rules) {
                    let match = false;
                    const keyword = rule.keyword.toLowerCase();
                    const incoming = text.toLowerCase();

                    switch (rule.matchType) {
                        case 'EXACT':
                            match = incoming === keyword;
                            break;
                        case 'CONTAINS':
                            match = incoming.includes(keyword);
                            break;
                        case 'STARTS_WITH':
                            match = incoming.startsWith(keyword);
                            break;
                        case 'REGEX':
                            try {
                                const regex = new RegExp(rule.keyword, 'i');
                                match = regex.test(text); // Use original case for regex
                            } catch (e) {
                                logger.error("AutoReply", "Invalid regex in auto-reply", rule.keyword);
                            }
                            break;
                    }

                    if (match) {
                        // Check trigger context (GROUP, PRIVATE, or ALL)
                        const isGroup = remoteJid.endsWith('@g.us');
                        const triggerType = (rule as any).triggerType || 'ALL'; // Default to ALL if undefined

                        if (triggerType === 'GROUP' && !isGroup) continue;
                        if (triggerType === 'PRIVATE' && isGroup) continue;

                        matchedRule = true;
                        logger.info("AutoReply", `Match: ${rule.keyword} -> ${remoteJid}`);

                        if (rule.isMedia && rule.mediaUrl) {
                            const url = rule.mediaUrl;
                            const type = (rule as any).mediaType || "document";
                            
                            let payload: any = {};
                            if (rule.response) {
                                payload.caption = rule.response;
                            }

                            if (type === "image") {
                                payload.image = { url };
                            } else if (type === "video") {
                                payload.video = { url };
                            } else if (type === "audio") {
                                payload = { audio: { url } };
                            } else {
                                payload.document = { url };
                                payload.mimetype = 'application/octet-stream';
                                payload.fileName = url.split('/').pop() || 'document';
                            }
                            
                            try {
                                await sock.sendMessage(remoteJid, payload, { quoted: msg });
                            } catch (err: any) {
                                logger.error("AutoReply", `Failed to send media auto-reply from URL: ${err.message}. Falling back to text if response exists.`);
                                if (rule.response) {
                                    await sock.sendMessage(remoteJid, { text: rule.response }, { quoted: msg });
                                }
                            }
                        } else if (rule.response) {
                            await sock.sendMessage(remoteJid, { text: rule.response }, { quoted: msg });
                        }

                        break;
                    }
                }

                const shouldUseAi = config.aiEnabled && (config.aiTriggerMode === "ALWAYS" || !matchedRule);
                if (shouldUseAi) {
                    if (!isAiConfigured()) {
                        logger.warn("AI", "AI auto-reply is enabled but AI_API_KEY is not configured.");
                    } else {
                        const reply = await generateAiReply({
                            userMessage: text,
                            systemPrompt: config.aiSystemPrompt,
                            botName: config.botName,
                        });
                        await sock.sendMessage(remoteJid, { text: reply }, { quoted: msg });
                    }
                }

            } catch (e) {
                logger.error("AutoReply", "Error executing auto-reply", e);
            }
        }
    });
}
