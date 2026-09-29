import { prisma } from "@/lib/prisma";
import { WhatsAppInstance } from "./instance";
import { Server } from "socket.io";
import { logger } from "@/lib/logger";

declare global {
    var __waManager: WhatsAppManager | undefined;
    var __io: Server | undefined;
}

export class WhatsAppManager {
    private sessions: Map<string, WhatsAppInstance> = new Map();
    private cuidMap: Map<string, string> = new Map(); // Maps database CUID (session.id) -> slug (session.sessionId)
    public io: Server | null = null;

    constructor() {
        if (globalThis.__io) {
            this.io = globalThis.__io;
        } else if ((global as any).io) {
            this.io = (global as any).io;
        }
    }

    public static getInstance(): WhatsAppManager {
        if (!globalThis.__waManager) {
            globalThis.__waManager = new WhatsAppManager();
        }
        return globalThis.__waManager;
    }

    setup(io: Server) {
        this.io = io;
        globalThis.__io = io;
        (global as any).io = io;
        logger.info("Manager", "Socket.IO server registered with WhatsAppManager");
    }

    public getIO(): Server | null {
        if (!this.io) {
            this.io = globalThis.__io || (global as any).io || null;
        }
        return this.io;
    }

    async loadSessions() {
        const io = this.getIO();
        logger.info("Manager", "Loading existing WhatsApp sessions from database...");

        try {
            const sessions = await prisma.session.findMany({
                where: {
                    status: { notIn: ["LOGGED_OUT", "STOPPED"] }
                },
                select: { sessionId: true, userId: true, status: true, id: true }
            });

            let started = 0;
            for (const session of sessions) {
                try {
                    // Check if credentials exist in authState
                    const authCount = await prisma.authState.count({
                        where: { sessionId: session.sessionId }
                    });

                    if (authCount === 0) {
                        // Never connected, set to STOPPED
                        await prisma.session.update({
                            where: { id: session.id },
                            data: { status: "STOPPED", qr: null }
                        }).catch(() => {});
                        continue;
                    }

                    const instance = new WhatsAppInstance(session.sessionId, session.userId, io);
                    instance.onRemovedFromManager = () => this.removeInstance(session.sessionId);
                    this.sessions.set(session.sessionId, instance);
                    this.cuidMap.set(session.id, session.sessionId);
                    
                    // Initialize without blocking entire loop
                    instance.init().catch(err => {
                        logger.error("Manager", `Failed to restore session ${session.sessionId}:`, err);
                    });
                    started++;
                } catch (sessErr) {
                    logger.error("Manager", `Error loading session ${session.sessionId}:`, sessErr);
                }
            }
            logger.success("Manager", `Initialized ${started} active sessions (${sessions.length - started} stopped/idle).`);
        } catch (error) {
            logger.error("Manager", "Failed to query sessions from database during startup:", error);
        }
    }

    async createSession(userId: string, name: string, customSessionId?: string, tenantId?: string) {
        const trimmedName = (name || "").trim();
        if (!trimmedName || trimmedName.length < 2) {
            throw new Error("Session name must be at least 2 characters long");
        }
        if (trimmedName.length > 50) {
            throw new Error("Session name cannot exceed 50 characters");
        }

        // Verify tenant limits if tenantId is provided
        if (tenantId) {
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId }
            });
            if (tenant) {
                if (tenant.status === "SUSPENDED") {
                    throw new Error("Account is suspended. Please contact platform support.");
                }
                const currentSessionsCount = await prisma.session.count({
                    where: {
                        tenantId,
                        status: { not: "LOGGED_OUT" }
                    }
                });
                if (currentSessionsCount >= tenant.maxSessions) {
                    throw new Error(`Your plan limit of ${tenant.maxSessions} active WhatsApp session(s) has been reached. Please contact your administrator to upgrade your plan.`);
                }
            }
        }

        // Sanitize or generate sessionId
        let sessionId: string;
        if (customSessionId && customSessionId.trim()) {
            sessionId = customSessionId.trim().replace(/[^a-zA-Z0-9-_]/g, "");
            if (sessionId.length < 3 || sessionId.length > 64) {
                throw new Error("Session ID must be between 3 and 64 characters (letters, numbers, hyphens, underscores)");
            }
        } else {
            const cleanPrefix = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 15);
            sessionId = `${cleanPrefix || "wa"}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        }

        // Check if sessionId already exists
        const existingSession = await prisma.session.findUnique({
            where: { sessionId }
        });
        if (existingSession) {
            throw new Error(`A session with ID "${sessionId}" already exists. Please choose a different ID.`);
        }

        // Check if tenant/user already has a session with identical name
        const duplicateName = await prisma.session.findFirst({
            where: tenantId ? {
                tenantId,
                name: trimmedName,
                status: { not: "LOGGED_OUT" }
            } : {
                userId,
                name: trimmedName,
                status: { not: "LOGGED_OUT" }
            }
        });
        if (duplicateName) {
            throw new Error(`You already have an active session named "${trimmedName}". Please use a unique name.`);
        }

        const io = this.getIO();

        // Create in database with CONNECTING status
        const session = await prisma.session.create({
            data: {
                userId,
                tenantId: tenantId || null,
                name: trimmedName,
                sessionId,
                status: "CONNECTING",
                qr: null,
                botConfig: {
                    create: {
                        enabled: true,
                        botMode: "OWNER",
                        autoReplyMode: "ALL",
                        antiSpamEnabled: true,
                        spamLimit: 5,
                        spamInterval: 10,
                        spamDelayMin: 1500,
                        spamDelayMax: 3500,
                        simulatePresence: true,
                        autoOptOut: true,
                        dailyLimit: 500,
                    }
                }
            }
        });

        logger.info("Manager", `Session ${sessionId} ("${trimmedName}") record created in DB for tenant ${tenantId || 'none'}. Initializing WhatsApp client...`);

        // Initialize instance immediately so QR code is generated right away
        const instance = new WhatsAppInstance(sessionId, userId, io);
        instance.onRemovedFromManager = () => this.removeInstance(sessionId);
        this.sessions.set(sessionId, instance);
        this.cuidMap.set(session.id, sessionId);

        // Start initialization asynchronously
        instance.init().catch(async (err) => {
            logger.error("Manager", `Error initializing client for ${sessionId}:`, err);
            await prisma.session.update({
                where: { id: session.id },
                data: { status: "FAILED" }
            }).catch(() => {});
        });

        return session;
    }

    public getInstance(idOrSessionId: string): WhatsAppInstance | undefined {
        if (!idOrSessionId) return undefined;
        // Direct map lookup by sessionId
        let instance = this.sessions.get(idOrSessionId);
        if (instance) return instance;

        // Check if idOrSessionId is a database CUID
        const mappedSlug = this.cuidMap.get(idOrSessionId);
        if (mappedSlug) {
            instance = this.sessions.get(mappedSlug);
            if (instance) return instance;
        }

        // Search in map values in case an internal identifier was passed
        for (const inst of this.sessions.values()) {
            if (inst.sessionId === idOrSessionId) {
                return inst;
            }
        }
        return undefined;
    }

    public removeInstance(sessionId: string) {
        const inst = this.sessions.get(sessionId);
        if (inst) {
            logger.info("Manager", `Removing session ${sessionId} from memory.`);
            this.sessions.delete(sessionId);
        }
        for (const [cuid, slug] of this.cuidMap.entries()) {
            if (slug === sessionId) {
                this.cuidMap.delete(cuid);
            }
        }
    }

    async deleteSession(sessionId: string) {
        const instance = this.getInstance(sessionId);
        const actualSessionId = instance ? instance.sessionId : sessionId;
        if (instance) {
            await instance.shutdown();
            this.sessions.delete(actualSessionId);
        }

        for (const [cuid, slug] of this.cuidMap.entries()) {
            if (slug === actualSessionId || cuid === sessionId) {
                this.cuidMap.delete(cuid);
            }
        }

        // Clean up both AuthState credentials and Session record
        try {
            await prisma.authState.deleteMany({
                where: { sessionId: actualSessionId }
            });
        } catch (e) {
            logger.warn("Manager", `Failed to delete authState for ${actualSessionId}:`, e);
        }

        try {
            await prisma.session.deleteMany({
                where: {
                    OR: [{ sessionId: actualSessionId }, { id: actualSessionId }, { sessionId }, { id: sessionId }]
                }
            });
            logger.success("Manager", `Session ${actualSessionId} and credentials permanently deleted.`);
        } catch (e) {
            logger.error("Manager", `Failed to delete session ${actualSessionId} from DB:`, e);
            throw e;
        }

        const io = this.getIO();
        if (io) {
            io.to(actualSessionId).emit("session.deleted", { sessionId: actualSessionId });
        }
    }

    async stopSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            await instance.shutdown();
            this.sessions.delete(sessionId);
        }

        await prisma.session.updateMany({
            where: {
                OR: [{ sessionId }, { id: sessionId }]
            },
            data: { status: "STOPPED", qr: null }
        }).catch(() => {});

        const io = this.getIO();
        if (io) {
            io.to(sessionId).emit("connection.update", { sessionId, status: "STOPPED", qr: null });
        }
    }

    async startSession(sessionId: string) {
        // Find session in DB by sessionId or CUID
        const session = await prisma.session.findFirst({
            where: {
                OR: [{ sessionId }, { id: sessionId }]
            }
        });
        if (!session) throw new Error("Session not found");

        const actualSessionId = session.sessionId;

        // If already connected, do nothing
        const existingInstance = this.sessions.get(actualSessionId);
        if (existingInstance && existingInstance.status === "CONNECTED") {
            return existingInstance;
        }

        if (existingInstance) {
            await existingInstance.shutdown();
            this.sessions.delete(actualSessionId);
        }

        // Create fresh instance
        const io = this.getIO();
        const instance = new WhatsAppInstance(actualSessionId, session.userId, io);
        instance.onRemovedFromManager = () => this.removeInstance(actualSessionId);
        this.sessions.set(actualSessionId, instance);
        this.cuidMap.set(session.id, actualSessionId);

        await prisma.session.update({
            where: { id: session.id },
            data: { status: "CONNECTING", qr: null }
        }).catch(() => {});

        await instance.init();
        return instance;
    }

    async restartSession(sessionId: string) {
        await this.stopSession(sessionId);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return await this.startSession(sessionId);
    }

    async requestPairingCode(sessionId: string, phoneNumber: string) {
        let instance = this.getInstance(sessionId);
        if (!instance) {
            // Auto start session if not started
            instance = await this.startSession(sessionId);
        }
        return await instance.requestPairingCode(phoneNumber);
    }
}

export const waManager = WhatsAppManager.getInstance();
