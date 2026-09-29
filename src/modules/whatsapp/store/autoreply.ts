import { prisma } from "@/lib/prisma";
import type { WASocket } from "@whiskeysockets/baileys";
import { normalizeMessageContent } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";
import { generateAiReply, isAiConfigured } from "@/modules/whatsapp/bot/ai-reply";
import { sendHandoffNotification } from "@/lib/notifications";

// Helper for permission check
function canAutoReply(config: any, fromMe: boolean, senderJid: string): boolean {
    if (!config || !config.enabled) return false;

    // Auto Reply Specific Mode
    const mode = config.autoReplyMode || 'ALL';

    if (fromMe) {
        if (mode === 'OWNER') return true;
        if (mode === 'ALL') return false; // Standard auto-reply ignores self
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

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split a comma, semicolon, newline, or pipe-separated keyword definition into individual keywords.
 * Example: "hi, hello, hallo, grüezi, guten tag, guten morgen" -> ["hi", "hello", "hallo", "grüezi", "guten tag", "guten morgen"]
 */
function extractKeywords(rawKeyword: string): string[] {
    if (!rawKeyword) return [];
    return rawKeyword
        .split(/[,;\n|]+/)
        .map(k => k.trim())
        .filter(k => k.length > 0);
}

/**
 * Checks whether an incoming message matches any keyword in the rule.
 * Handles multiple comma-separated keywords for EXACT, CONTAINS, STARTS_WITH, and REGEX.
 */
function checkRuleMatch(rule: { keyword: string; matchType: string }, incomingRaw: string): boolean {
    const rawIncoming = incomingRaw.trim();
    const incomingLower = rawIncoming.toLowerCase();
    // Stripped of surrounding punctuation for realistic chat (e.g. "Hallo!", "Hi?", "Probefahrt.")
    const incomingClean = incomingLower.replace(/^[!?.,:;\s]+|[!?.,:;\s]+$/g, '');

    const keywords = extractKeywords(rule.keyword);
    if (keywords.length === 0) return false;

    switch (rule.matchType) {
        case 'EXACT': {
            return keywords.some(k => {
                const cleanK = k.toLowerCase().replace(/^[!?.,:;\s]+|[!?.,:;\s]+$/g, '');
                return incomingClean === cleanK || incomingLower === k.toLowerCase();
            });
        }
        case 'CONTAINS': {
            return keywords.some(k => {
                const lowerK = k.toLowerCase();
                if (!lowerK) return false;
                // For very short words (<= 3 chars like "hi", "ja"), require word boundaries so "this" doesn't trigger "hi"
                if (lowerK.length <= 3) {
                    const regex = new RegExp(`(^|\\s|[.,!?;:()_-])${escapeRegExp(lowerK)}($|\\s|[.,!?;:()_-])`, 'i');
                    return regex.test(rawIncoming);
                }
                return incomingLower.includes(lowerK);
            });
        }
        case 'STARTS_WITH': {
            return keywords.some(k => {
                const lowerK = k.toLowerCase();
                return incomingLower.startsWith(lowerK) || incomingClean.startsWith(lowerK);
            });
        }
        case 'REGEX': {
            // First try evaluating as standard regex pattern
            try {
                const regex = new RegExp(rule.keyword, 'i');
                if (regex.test(rawIncoming)) return true;
            } catch (e) {
                // Ignore regex parse error if user entered comma-separated words in REGEX mode
            }

            // Fallback for comma-separated patterns in regex mode
            if (rule.keyword.includes(',') || rule.keyword.includes('|')) {
                return keywords.some(k => {
                    try {
                        const regex = new RegExp(`(^|\\b)${escapeRegExp(k)}(\\b|$)`, 'i');
                        return regex.test(rawIncoming);
                    } catch {
                        return incomingLower.includes(k.toLowerCase());
                    }
                });
            }
            return false;
        }
        default:
            return false;
    }
}

/**
 * Normalizes paragraph breaks and splits into multiple messages if the user configured a separator.
 * Separators supported: [split], \n---\n, \n===\n, or |||
 */
function parseResponseMessages(response: string): string[] {
    if (!response) return [];
    // Normalize newlines: unescape literal \n, convert \r\n to \n
    const normalized = response
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .trim();

    // Check if user specified a separator for multiple distinct messages
    if (/\[split\]|\n---\n|\n===\n|\|\|\|/.test(normalized)) {
        return normalized
            .split(/\n?\[split\]\n?|\n---\n|\n===\n|\|\|\|/)
            .map(part => part.trim())
            .filter(part => part.length > 0);
    }

    return [normalized];
}

export async function bindAutoReply(sock: WASocket, sessionId: string) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        // Fetch session ID and Bot Config once per batch
        const session = await prisma.session.findUnique({
            where: { sessionId },
            include: { botConfig: true }
        });

        if (!session) return;

        let config = session.botConfig;

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

        if (!config || !config.enabled) return;

        for (const msg of messages) {
            const fromMe = msg.key.fromMe || false;
            const remoteJid = msg.key.remoteJid;

            // Never reply to status, broadcast, or newsletter chats
            if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.includes('@broadcast') || remoteJid.includes('@newsletter')) {
                continue;
            }

            // Standardized Sender Logic
            const isGroup = remoteJid.endsWith("@g.us");
            const remoteJidAlt = msg.key.remoteJidAlt;
            let senderJid = (isGroup ? (msg.key.participant || msg.participant) : remoteJid);

            if (!isGroup && remoteJidAlt) {
                senderJid = remoteJidAlt;
            }

            if (!senderJid) continue;

            // --- 1. HUMAN TAKEOVER AUTO-PAUSE ---
            // If the message is fromMe (human agent/owner sent from WhatsApp phone or dashboard),
            // auto-pause the bot for this contact so the bot doesn't talk over the human agent!
            if (fromMe && !isGroup) {
                try {
                    const contact = await prisma.contact.findFirst({
                        where: {
                            sessionId: session.id,
                            OR: [{ jid: remoteJid }, { remoteJidAlt: remoteJid }]
                        }
                    });
                    if (contact) {
                        const prevData = (contact.data && typeof contact.data === "object") ? (contact.data as Record<string, any>) : {};
                        await prisma.contact.update({
                            where: { id: contact.id },
                            data: {
                                data: {
                                    ...prevData,
                                    aiPaused: true,
                                    aiPausedAt: new Date().toISOString(),
                                    aiPausedReason: "HUMAN_AGENT_REPLY",
                                    lastHumanMessageAt: new Date().toISOString()
                                }
                            }
                        });
                        logger.info("HumanTakeover", `AI paused for ${remoteJid} due to human agent reply`);
                    }
                } catch (takeoverErr) {
                    logger.error("HumanTakeover", "Error recording human takeover:", takeoverErr);
                }
                continue;
            }

            // Check Permissions
            if (!canAutoReply(config, fromMe, senderJid)) continue;

            // --- 2. CHECK IF AI BOT IS PAUSED FOR THIS CONTACT ---
            let currentContact: any = null;
            if (!isGroup) {
                try {
                    currentContact = await prisma.contact.findFirst({
                        where: {
                            sessionId: session.id,
                            OR: [{ jid: remoteJid }, { remoteJidAlt: remoteJid }]
                        }
                    });
                    if (currentContact?.data && typeof currentContact.data === "object") {
                        const cData = currentContact.data as Record<string, any>;
                        if (cData.aiPaused === true) {
                            logger.info("AutoReply", `Skipping automated reply for ${remoteJid} because bot is paused (Human Agent in charge).`);
                            continue;
                        }
                    }
                } catch (contactErr) {
                    logger.error("AutoReply", "Error checking contact pause status:", contactErr);
                }
            }

            const content = normalizeMessageContent(msg.message);
            const text = content?.conversation || content?.extendedTextMessage?.text || "";

            if (!text || !text.trim()) continue;

            // --- 3. EXPLICIT HUMAN ESCALATION & PAYMENT KEYWORD DETECTION ---
            const textLower = text.toLowerCase();
            const isEscalationRequest = !isGroup && (
                // English
                /\b(speak to human|talk to human|real person|human agent|real agent|talk to someone|speak with someone|speak to person|need human|call me|payment|how to pay|bank transfer|iban|credit card|down payment|sign contract|finalize purchase|deposit)\b/i.test(textLower) ||
                // German
                /\b(mitarbeiter|mensch|berater|menschlicher berater|echte person|mit jemandem sprechen|bezahlen|zahlung|überweisung|kreditkarte|anzahlung|vertrag unterschreiben|vertrag abschliessen|kaufvertrag)\b/i.test(textLower) ||
                // French
                /\b(parler à un conseiller|parler à quelqu'un|personne réelle|humain|agent humain|payer|paiement|virement|carte de crédit|acompte|signer le contrat|finaliser l'achat)\b/i.test(textLower)
            );

            if (isEscalationRequest) {
                try {
                    const handoffText = "👤 Thank you! For your financial security and personalized agreement, all payments, contract finalizations, and special arrangements are handled directly by our official advisors.\n\nI have notified our sales team right now — an advisor will take over this chat / reach out to you shortly!";
                    await sock.sendMessage(remoteJid, { text: handoffText }, { quoted: msg });

                    if (currentContact) {
                        const prevData = (currentContact.data && typeof currentContact.data === "object") ? (currentContact.data as Record<string, any>) : {};
                        await prisma.contact.update({
                            where: { id: currentContact.id },
                            data: {
                                leadStage: "QUALIFIED",
                                data: {
                                    ...prevData,
                                    aiPaused: true,
                                    aiPausedAt: new Date().toISOString(),
                                    aiPausedReason: "CUSTOMER_ESCALATION"
                                }
                            }
                        });
                    }

                    await sendHandoffNotification({
                        sessionId: session.id,
                        tenantId: session.tenantId,
                        customerJid: remoteJid,
                        customerName: currentContact?.name || currentContact?.notify || msg.pushName,
                        reason: "Customer requested human advisor / payment assistance",
                        snippet: text
                    });

                    continue;
                } catch (escErr: any) {
                    logger.error("Escalation", "Error executing customer escalation:", escErr);
                }
            }

            // --- Automatic Safety & Compliance Opt-Out Handling ---
            const trimmedUpper = text.trim().toUpperCase();
            const optOutKeywords = ["STOP", "UNSUBSCRIBE", "BERHENTI", "BATAL", "CANCEL", "OPTOUT", "OPT OUT", "KELUAR"];
            const resubscribeKeywords = ["START", "SUBSCRIBE", "DAFTAR", "MULAI", "LANJUT", "UNBLOCK"];

            if (config.autoOptOut !== false && !isGroup && optOutKeywords.includes(trimmedUpper)) {
                try {
                    const currentBlocked: string[] = Array.isArray(config.botBlockedJids) ? [...config.botBlockedJids as string[]] : [];
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
                    const currentBlocked: string[] = Array.isArray(config.botBlockedJids) ? [...config.botBlockedJids as string[]] : [];
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
                        sessionId: session.id
                    }
                });

                let matchedRule = false;

                for (const rule of rules) {
                    // Check trigger context (GROUP, PRIVATE, or ALL)
                    const triggerType = (rule as any).triggerType || 'ALL';
                    if (triggerType === 'GROUP' && !isGroup) continue;
                    if (triggerType === 'PRIVATE' && isGroup) continue;

                    // Match against single or multiple comma-separated keywords
                    const match = checkRuleMatch(rule, text);

                    if (match) {
                        matchedRule = true;
                        logger.info("AutoReply", `Match: "${rule.keyword}" -> ${remoteJid}`);

                        const responseParts = parseResponseMessages(rule.response || "");

                        if (rule.isMedia && rule.mediaUrl) {
                            const url = rule.mediaUrl;
                            const type = (rule as any).mediaType || "document";
                            
                            let payload: any = {};
                            if (responseParts.length > 0) {
                                payload.caption = responseParts[0];
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
                                // If there are additional split message parts after media
                                for (let p = 1; p < responseParts.length; p++) {
                                    await new Promise(r => setTimeout(r, 600));
                                    await sock.sendMessage(remoteJid, { text: responseParts[p] });
                                }
                            } catch (err: any) {
                                logger.error("AutoReply", `Failed to send media auto-reply from URL: ${err.message}. Falling back to text if response exists.`);
                                for (let p = 0; p < responseParts.length; p++) {
                                    if (p > 0) await new Promise(r => setTimeout(r, 600));
                                    await sock.sendMessage(remoteJid, { text: responseParts[p] }, p === 0 ? { quoted: msg } : {});
                                }
                            }
                        } else if (responseParts.length > 0) {
                            // Send single or multiple separated messages
                            for (let p = 0; p < responseParts.length; p++) {
                                if (p > 0) await new Promise(r => setTimeout(r, 600));
                                await sock.sendMessage(remoteJid, { text: responseParts[p] }, p === 0 ? { quoted: msg } : {});
                            }
                        }

                        break; // Stop after first matched rule
                    }
                }

                // AI Auto-Reply fallback or always mode
                const shouldUseAi = config.aiEnabled && (config.aiTriggerMode === "ALWAYS" || !matchedRule);
                if (shouldUseAi) {
                    if (!isAiConfigured(config)) {
                        logger.warn("AI", `AI auto-reply is enabled for ${sessionId} but no API key is configured.`);
                    } else {
                        try {
                            const reply = await generateAiReply({
                                userMessage: text,
                                systemPrompt: config.aiSystemPrompt,
                                botName: config.botName,
                                tenantId: session.tenantId,
                                config: config
                            });

                            const hasAiEscalation = /\[ESCALATE_TO_HUMAN(?::\s*[^\]]+)?\]/i.test(reply);
                            const cleanReply = reply.replace(/\[ESCALATE_TO_HUMAN(?::\s*[^\]]+)?\]/gi, "").trim();

                            if (hasAiEscalation && !isGroup) {
                                try {
                                    if (currentContact) {
                                        const prevData = (currentContact.data && typeof currentContact.data === "object") ? (currentContact.data as Record<string, any>) : {};
                                        await prisma.contact.update({
                                            where: { id: currentContact.id },
                                            data: {
                                                leadStage: "QUALIFIED",
                                                data: {
                                                    ...prevData,
                                                    aiPaused: true,
                                                    aiPausedAt: new Date().toISOString(),
                                                    aiPausedReason: "AI_ESCALATION"
                                                }
                                            }
                                        });
                                    }

                                    await sendHandoffNotification({
                                        sessionId: session.id,
                                        tenantId: session.tenantId,
                                        customerJid: remoteJid,
                                        customerName: currentContact?.name || currentContact?.notify || msg.pushName,
                                        reason: "AI escalated conversation for payment, contract, or human assistance",
                                        snippet: text
                                    });
                                } catch (aiEscErr) {
                                    logger.error("Escalation", "Error recording AI escalation:", aiEscErr);
                                }
                            }

                            const replyParts = parseResponseMessages(cleanReply);
                            for (let p = 0; p < replyParts.length; p++) {
                                if (p > 0) await new Promise(r => setTimeout(r, 600));
                                await sock.sendMessage(remoteJid, { text: replyParts[p] }, p === 0 ? { quoted: msg } : {});
                            }
                        } catch (aiError: any) {
                            logger.error("AI", "Error generating AI auto-reply:", aiError?.message || aiError);
                        }
                    }
                }

            } catch (e) {
                logger.error("AutoReply", "Error executing auto-reply", e);
            }
        }
    });
}
