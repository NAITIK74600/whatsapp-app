import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface AntiSpamConfig {
    antiSpamEnabled: boolean;
    spamLimit: number;
    spamInterval: number;
    spamDelayMin: number;
    spamDelayMax: number;
    simulatePresence: boolean;
    autoOptOut: boolean;
    dailyLimit: number;
}

interface QueueItem {
    id: number;
    sessionId: string;
    jid: string;
    content: any;
    messageType: string;
    queuedAt: number;
    socket?: any;
    resolve: () => void;
    reject: (err: any) => void;
}

export interface SafetyAuditResult {
    score: number; // 0 - 100
    status: "OPTIMAL" | "MODERATE" | "HIGH_RISK";
    todaySent: number;
    dailyLimit: number;
    optOutCount: number;
    config: AntiSpamConfig;
    checks: {
        id: string;
        title: string;
        passed: boolean;
        description: string;
        weight: number;
    }[];
    recommendations: string[];
}

class AntiSpamManager {
    private static instance: AntiSpamManager;
    private sessionHistory: Map<string, number[]> = new Map();
    private configCache: Map<string, { config: AntiSpamConfig | null; cachedAt: number }> = new Map();
    private processing: Map<string, boolean> = new Map();
    private queues: Map<string, QueueItem[]> = new Map();
    private dailyCounts: Map<string, { count: number; dateStr: string }> = new Map();
    private messageCounter = 0;

    private constructor() { }

    static getInstance(): AntiSpamManager {
        if (!AntiSpamManager.instance) {
            AntiSpamManager.instance = new AntiSpamManager();
        }
        return AntiSpamManager.instance;
    }

    /**
     * Simulate realistic human typing presence before dispatching message.
     * Emits `composing` signal to WhatsApp protocol, waits natural delay, then pauses.
     */
    async simulateHumanPresence(socket: any, jid: string, textLength: number = 20): Promise<void> {
        if (!socket || typeof socket.sendPresenceUpdate !== "function") return;
        if (!jid || jid.endsWith("@g.us") || jid.includes("@broadcast")) return; // Only private chats

        try {
            await socket.sendPresenceUpdate("composing", jid);
            // Dynamic typing delay: 500ms base + 20ms per character, capped between 800ms and 2200ms
            const typingDuration = Math.min(2200, Math.max(800, 500 + textLength * 20));
            await this.sleep(typingDuration);
            await socket.sendPresenceUpdate("paused", jid);
        } catch {
            // Presence update is non-critical — never crash sending pipeline if presence handshake fails
        }
    }

    /**
     * Enqueue a message and wait for its turn.
     * Integrates anti-spam rate limiting, human typing presence, and daily quotas.
     */
    async enqueue(sessionId: string, jid: string, content: any, socket?: any): Promise<void> {
        const config = await this.getAntiSpamConfig(sessionId);

        // Even if anti-spam is disabled, simulate typing presence if configured
        if (!config || !config.antiSpamEnabled) {
            if (config?.simulatePresence && socket) {
                const text = content?.text || content?.caption || "";
                await this.simulateHumanPresence(socket, jid, text.length);
            }
            this.recordSend(sessionId);
            return;
        }

        const messageType = this.detectMessageType(content);
        const msgId = ++this.messageCounter;

        return new Promise<void>((resolve, reject) => {
            const item: QueueItem = {
                id: msgId,
                sessionId,
                jid,
                content,
                messageType,
                queuedAt: Date.now(),
                socket,
                resolve,
                reject,
            };

            if (!this.queues.has(sessionId)) {
                this.queues.set(sessionId, []);
            }
            this.queues.get(sessionId)!.push(item);

            const queue = this.queues.get(sessionId)!;
            const position = queue.length;

            logger.debug("Anti-Spam",
                `📥 QUEUED  | Session: ${sessionId} | #${msgId} | To: ${this.formatJid(jid)} | Type: ${messageType} | Queue pos: ${position}`
            );

            // Start processing if not already running
            this.processQueue(sessionId);
        });
    }

    private async processQueue(sessionId: string) {
        if (this.processing.get(sessionId)) return; // Already processing
        this.processing.set(sessionId, true);

        const config = await this.getAntiSpamConfig(sessionId);
        if (!config) {
            this.processing.set(sessionId, false);
            return;
        }

        while (true) {
            const queue = this.queues.get(sessionId);
            if (!queue || queue.length === 0) break;

            const item = queue[0]; // Peek at front
            const now = Date.now();
            const history = this.sessionHistory.get(sessionId) || [];

            // Clean history: keep only messages in the current window
            const windowStart = now - (config.spamInterval * 1000);
            const recentMessages = history.filter(ts => ts > windowStart);
            this.sessionHistory.set(sessionId, recentMessages);

            // Daily Quota Check
            const today = this.getDailyCount(sessionId);
            let quotaMultiplier = 1;
            if (today.count >= config.dailyLimit) {
                quotaMultiplier = 2.5; // Apply 2.5x cooling delay when daily limit is reached to protect number
                logger.warn("Anti-Spam",
                    `⚠️ QUOTA REACHED | Session: ${sessionId} sent ${today.count}/${config.dailyLimit} messages today. Applying cooling multiplier.`
                );
            }

            if (recentMessages.length >= config.spamLimit) {
                // Rate limit reached — calculate and apply delay
                const baseDelay = Math.floor(
                    Math.random() * (config.spamDelayMax - config.spamDelayMin + 1)
                ) + config.spamDelayMin;

                const delay = Math.round(baseDelay * quotaMultiplier);
                const sendAt = new Date(now + delay);
                const waitingSince = now - item.queuedAt;

                logger.warn("Anti-Spam",
                    `⏳ DELAY   | Session: ${sessionId} | #${item.id} | Rate: ${recentMessages.length}/${config.spamLimit} in ${config.spamInterval}s | Delay: ${delay}ms | Send at: ${sendAt.toLocaleTimeString()} | Waiting: ${waitingSince}ms | Queue: ${queue.length} remaining`
                );

                await this.sleep(delay);

                // Re-fetch config (might have changed during delay)
                const freshConfig = await this.getAntiSpamConfig(sessionId);
                if (!freshConfig || !freshConfig.antiSpamEnabled) {
                    logger.warn("Anti-Spam", `⚡ DISABLED | Session: ${sessionId} | Flushing ${queue.length} queued messages immediately`);
                    while (queue.length > 0) {
                        const q = queue.shift()!;
                        this.recordSend(sessionId);
                        q.resolve();
                    }
                    break;
                }
                continue; // Re-check rate after delay
            }

            // Simulate human presence if enabled
            if (config.simulatePresence && item.socket) {
                const text = item.content?.text || item.content?.caption || "";
                await this.simulateHumanPresence(item.socket, item.jid, text.length);
            }

            // Rate is within limit — dispatch message
            queue.shift(); // Remove from queue
            this.recordSend(sessionId);

            const totalWait = Date.now() - item.queuedAt;
            const remainingInQueue = queue.length;

            if (totalWait > 50) {
                logger.success("Anti-Spam",
                    `✅ SENDING | Session: ${sessionId} | #${item.id} | To: ${this.formatJid(item.jid)} | Type: ${item.messageType} | Waited: ${totalWait}ms | Queue: ${remainingInQueue} remaining`
                );
            } else {
                logger.success("Anti-Spam",
                    `✅ INSTANT | Session: ${sessionId} | #${item.id} | To: ${this.formatJid(item.jid)} | Type: ${item.messageType} | Rate: ${recentMessages.length + 1}/${config.spamLimit} | Queue: ${remainingInQueue} remaining`
                );
            }

            item.resolve();
        }

        this.processing.set(sessionId, false);
    }

    private recordSend(sessionId: string) {
        const now = Date.now();
        const history = this.sessionHistory.get(sessionId) || [];
        history.push(now);
        // Keep only last 60 seconds of history
        this.sessionHistory.set(
            sessionId,
            history.filter(ts => ts > now - 60000)
        );

        // Daily counter
        const todayStr = new Date().toISOString().slice(0, 10);
        const currentDaily = this.dailyCounts.get(sessionId);
        if (!currentDaily || currentDaily.dateStr !== todayStr) {
            this.dailyCounts.set(sessionId, { count: 1, dateStr: todayStr });
        } else {
            currentDaily.count++;
        }
    }

    public getDailyCount(sessionId: string): { count: number; dateStr: string } {
        const todayStr = new Date().toISOString().slice(0, 10);
        const current = this.dailyCounts.get(sessionId);
        if (!current || current.dateStr !== todayStr) {
            return { count: 0, dateStr: todayStr };
        }
        return current;
    }

    private detectMessageType(content: any): string {
        if (!content) return "unknown";
        if (content.text) return "text";
        if (content.image) return "image";
        if (content.video) return "video";
        if (content.audio) return "audio";
        if (content.document) return "document";
        if (content.sticker) return "sticker";
        if (content.react) return "reaction";
        if (content.delete) return "delete";
        if (content.poll) return "poll";
        if (content.location) return "location";
        if (content.contact) return "contact";
        return "other";
    }

    private formatJid(jid: string): string {
        if (!jid) return "";
        if (jid.endsWith("@s.whatsapp.net")) {
            return jid.replace("@s.whatsapp.net", "");
        }
        if (jid.endsWith("@g.us")) {
            return `group:${jid.replace("@g.us", "").slice(-6)}`;
        }
        return jid.slice(0, 15);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetch anti-spam config with 10-second cache
     */
    public async getAntiSpamConfig(sessionId: string): Promise<AntiSpamConfig | null> {
        const cached = this.configCache.get(sessionId);
        if (cached && (Date.now() - cached.cachedAt) < 10000) {
            return cached.config;
        }

        try {
            const session = await prisma.session.findUnique({
                where: { sessionId },
                select: {
                    botConfig: {
                        select: {
                            antiSpamEnabled: true,
                            spamLimit: true,
                            spamInterval: true,
                            spamDelayMin: true,
                            spamDelayMax: true,
                            simulatePresence: true,
                            autoOptOut: true,
                            dailyLimit: true,
                        }
                    }
                }
            });

            if (!session || !session.botConfig) {
                this.configCache.set(sessionId, { config: null, cachedAt: Date.now() });
                return null;
            }

            const row = session.botConfig;
            const config: AntiSpamConfig = {
                antiSpamEnabled: row.antiSpamEnabled ?? true,
                spamLimit: Number(row.spamLimit) || 5,
                spamInterval: Number(row.spamInterval) || 10,
                spamDelayMin: Number(row.spamDelayMin) || 1500,
                spamDelayMax: Number(row.spamDelayMax) || 3500,
                simulatePresence: row.simulatePresence ?? true,
                autoOptOut: row.autoOptOut ?? true,
                dailyLimit: Number(row.dailyLimit) || 500,
            };

            this.configCache.set(sessionId, { config, cachedAt: Date.now() });
            return config;
        } catch (error) {
            logger.error("Anti-Spam", `❌ ERROR   | Config fetch failed for ${sessionId}:`, error);
            this.configCache.set(sessionId, { config: null, cachedAt: Date.now() });
            return null;
        }
    }

    /** Clear cache for a session (call when config is updated) */
    clearCache(sessionId: string) {
        this.configCache.delete(sessionId);
    }

    /**
     * Comprehensive Safety Audit for this WhatsApp session.
     * Returns a safety score (0-100), health tier, and recommendations to prevent bans.
     */
    async getSafetyAudit(sessionId: string): Promise<SafetyAuditResult> {
        const config = await this.getAntiSpamConfig(sessionId) || {
            antiSpamEnabled: true,
            spamLimit: 5,
            spamInterval: 10,
            spamDelayMin: 1500,
            spamDelayMax: 3500,
            simulatePresence: true,
            autoOptOut: true,
            dailyLimit: 500,
        };

        const today = this.getDailyCount(sessionId);

        // Count opted-out contacts
        let optOutCount = 0;
        try {
            const sess = await prisma.session.findUnique({
                where: { sessionId },
                select: { botConfig: { select: { botBlockedJids: true } } }
            });
            const blocked = sess?.botConfig?.botBlockedJids;
            if (Array.isArray(blocked)) {
                optOutCount = blocked.length;
            }
        } catch { }

        const checks = [
            {
                id: "antiSpam",
                title: "Anti-Spam Delay Engine",
                passed: config.antiSpamEnabled,
                description: config.antiSpamEnabled
                    ? `Active (Max ${config.spamLimit} messages / ${config.spamInterval}s window)`
                    : "Disabled — Outgoing messages are sent instantly with 0ms delay (High Ban Risk)",
                weight: 30
            },
            {
                id: "presence",
                title: "Human Presence (Typing...) Simulation",
                passed: config.simulatePresence,
                description: config.simulatePresence
                    ? "Active — Sends realistic 'composing' presence to WhatsApp servers before dispatch"
                    : "Disabled — Robotic signature detected by Meta anti-abuse systems",
                weight: 25
            },
            {
                id: "optOut",
                title: "Automatic STOP / Opt-Out Compliance",
                passed: config.autoOptOut,
                description: config.autoOptOut
                    ? `Active — Automatically respects STOP / UNSUBSCRIBE keywords (${optOutCount} contacts protected)`
                    : "Disabled — Recipients who don't want messages cannot opt out and will report as spam",
                weight: 25
            },
            {
                id: "delayWindow",
                title: "Safe Random Jitter (Min Delay >= 1500ms)",
                passed: config.spamDelayMin >= 1000,
                description: config.spamDelayMin >= 1000
                    ? `Safe (${config.spamDelayMin}ms – ${config.spamDelayMax}ms random delay)`
                    : `Too aggressive (${config.spamDelayMin}ms delay is too fast)`,
                weight: 10
            },
            {
                id: "dailyQuota",
                title: "Daily Volume Threshold",
                passed: today.count < config.dailyLimit,
                description: `${today.count} / ${config.dailyLimit} sent today (${Math.max(0, config.dailyLimit - today.count)} remaining)`,
                weight: 10
            }
        ];

        let score = 0;
        const recommendations: string[] = [];

        for (const check of checks) {
            if (check.passed) {
                score += check.weight;
            } else {
                if (check.id === "antiSpam") {
                    recommendations.push("Enable Anti-Spam Delay immediately to prevent instant message bursts.");
                } else if (check.id === "presence") {
                    recommendations.push("Enable Human Presence Simulation so WhatsApp sees 'typing...' before messages.");
                } else if (check.id === "optOut") {
                    recommendations.push("Turn on Automatic Opt-Out to prevent recipients from reporting your number as spam.");
                } else if (check.id === "delayWindow") {
                    recommendations.push("Increase minimum delay to at least 1500ms with random jitter.");
                } else if (check.id === "dailyQuota") {
                    recommendations.push("Daily message volume exceeded. Pause bulk messaging until tomorrow to avoid detection.");
                }
            }
        }

        let status: "OPTIMAL" | "MODERATE" | "HIGH_RISK" = "OPTIMAL";
        if (score < 50) {
            status = "HIGH_RISK";
        } else if (score < 80) {
            status = "MODERATE";
        }

        return {
            score,
            status,
            todaySent: today.count,
            dailyLimit: config.dailyLimit,
            optOutCount,
            config,
            checks,
            recommendations
        };
    }
}

export const antispam = AntiSpamManager.getInstance();
