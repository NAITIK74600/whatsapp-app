import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    ConnectionState
} from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { usePrismaAuthState } from "./auth/usePrismaAuthState";
import { Server } from "socket.io";
import pino from "pino";
import { bindSessionStore } from "./store";
import { syncGroups } from "./store/groups";
import { bindContactSync } from "./store/contacts";
import { bindAutoReply } from "./store/autoreply";
import { bindPpGuard } from "./store/ppguard";
import { antispam } from "./antispam";
import { logger } from "@/lib/logger";

const MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_BAILEYS_VERSION: [number, number, number] = [2, 3000, 1043857760];

export class WhatsAppInstance {
    socket: WASocket | null = null;
    qr: string | null = null;
    status: string = "DISCONNECTED";
    sessionId: string;
    userId: string;
    io: Server | null;
    config: any = {};
    startTime: Date | null = null;
    pairingCode: string | null = null;

    isStopped: boolean = false;
    private reconnectCount: number = 0;
    /** Called when instance auto-stops or logs out — lets manager remove it from Map */
    onRemovedFromManager: (() => void) | null = null;

    constructor(sessionId: string, userId: string, io: Server | null) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.io = io || (globalThis as any).__io || (global as any).io || null;
    }

    /** Ensure we have the current IO server instance */
    private getIO(): Server | null {
        if (!this.io) {
            this.io = (globalThis as any).__io || (global as any).io || null;
        }
        return this.io;
    }

    /** Broadcast connection update to both session room and user room */
    public emitUpdate(payload: { status: string; qr?: string | null; pairingCode?: string | null; user?: any; error?: string | null }) {
        const io = this.getIO();
        const data = {
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            ...payload
        };

        if (io) {
            io.to(this.sessionId).emit("connection.update", data);
            io.to(`user:${this.userId}`).emit("connection.update", data);
        }
    }

    async init() {
        if (this.isStopped) {
            logger.info("Instance", `Session ${this.sessionId} is marked stopped, skipping init`);
            return;
        }

        const sessionData = await prisma.session.findUnique({
            where: { sessionId: this.sessionId },
            include: { botConfig: true }
        });

        if (!sessionData) {
            logger.warn("Instance", `Session ${this.sessionId} not found in DB, aborting init`);
            return;
        }

        this.config = sessionData?.config || {};
        const botConfig = (sessionData as any)?.botConfig;

        // Fetch auth state from Prisma
        const { state, saveCreds } = await usePrismaAuthState(this.sessionId);

        // Fetch latest version with safe fallback
        let version: [number, number, number] = DEFAULT_BAILEYS_VERSION;
        try {
            const v = await fetchLatestBaileysVersion();
            if (v && v.version) {
                version = v.version as [number, number, number];
            }
        } catch (e) {
            logger.warn("Instance", "Failed to fetch latest Baileys version online, using stable default", e);
        }

        try {
            this.socket = makeWASocket({
                version,
                logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || "error" }) as any,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: process.env.BAILEYS_LOG_LEVEL || "error" }) as any),
                },
                browser: ["Chrome (Linux)", "Chrome", "131.0.6778.85"],
                markOnlineOnConnect: botConfig?.alwaysOnline ?? true,
                syncFullHistory: false, // Prevent VPS out-of-memory and DB connection pool exhaustion
                generateHighQualityLinkPreview: false,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: true,
                retryRequestDelayMs: 500,
                maxMsgRetryCount: 3
            });

            // Anti-Spam Wrapper on sendMessage
            const originalSendMessage = this.socket.sendMessage.bind(this.socket);
            const sid = this.sessionId;
            const sock = this.socket;
            this.socket.sendMessage = async function (jid: string, content: any, options?: any) {
                await antispam.enqueue(sid, jid, content, sock);
                return originalSendMessage(jid, content, options);
            } as any;

            // Bind Store for DB Sync
            bindSessionStore(this.socket, this.sessionId, this.getIO());

            // Bind Contact Sync
            bindContactSync(this.socket, this.sessionId);

            this.socket.ev.on("creds.update", saveCreds);

            this.socket.ev.on("connection.update", async (update) => {
                await this.handleConnectionUpdate(update);
            });
        } catch (err) {
            logger.error("Instance", `Failed to initialize WASocket for ${this.sessionId}:`, err);
            this.status = "FAILED";
            await prisma.session.update({
                where: { sessionId: this.sessionId },
                data: { status: "FAILED" }
            }).catch(() => {});
            this.emitUpdate({ status: "FAILED", error: "Failed to initialize WhatsApp socket" });
        }
    }

    async handleConnectionUpdate(update: Partial<ConnectionState>) {
        const { connection, lastDisconnect, qr } = update;

        try {
            if (qr) {
                if (this.isStopped) return;
                this.reconnectCount = 0;
                this.qr = qr;
                this.status = "SCAN_QR";

                this.emitUpdate({ status: "SCAN_QR", qr });

                await prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { qr, status: "SCAN_QR" }
                }).catch(() => {});
            }

            if (connection === "close") {
                const code = (lastDisconnect?.error as any)?.output?.statusCode;
                const isLoggedOut = code === DisconnectReason.loggedOut;

                if (isLoggedOut) {
                    this.status = "LOGGED_OUT";
                    this.socket = null;
                    this.qr = null;
                    this.pairingCode = null;
                    this.emitUpdate({ status: "LOGGED_OUT", qr: null });

                    logger.info("Instance", `Session ${this.sessionId} logged out. Deleting credentials...`);
                    try {
                        await prisma.$transaction([
                            prisma.session.update({
                                where: { sessionId: this.sessionId },
                                data: { status: "LOGGED_OUT", qr: null }
                            }),
                            prisma.authState.deleteMany({
                                where: { sessionId: this.sessionId }
                            })
                        ]);
                    } catch (e) { /* ignore */ }

                    this.onRemovedFromManager?.();
                    return;
                }

                if (this.isStopped) {
                    this.status = "STOPPED";
                    this.socket = null;
                    this.reconnectCount = 0;
                    this.qr = null;
                    this.pairingCode = null;
                    this.emitUpdate({ status: "STOPPED", qr: null });

                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "STOPPED", qr: null }
                    }).catch(() => {});

                    const { waManager } = await import("./manager");
                    waManager.removeInstance(this.sessionId);
                    return;
                }

                // Unexpected disconnect: attempt reconnect
                this.reconnectCount++;
                const remaining = MAX_RECONNECT_ATTEMPTS - this.reconnectCount + 1;

                if (remaining > 0) {
                    this.status = "DISCONNECTED";
                    this.emitUpdate({ status: "DISCONNECTED", qr: null });
                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "DISCONNECTED", qr: null }
                    }).catch(() => {});

                    logger.warn("Instance", `Session ${this.sessionId} disconnected. Reconnecting (${this.reconnectCount}/${MAX_RECONNECT_ATTEMPTS})...`);
                    setTimeout(() => {
                        if (!this.isStopped) this.init();
                    }, 3500);
                } else {
                    this.status = "STOPPED";
                    this.socket = null;
                    this.reconnectCount = 0;
                    this.isStopped = true;
                    this.qr = null;
                    this.pairingCode = null;
                    this.emitUpdate({ status: "STOPPED", qr: null });

                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "STOPPED", qr: null }
                    }).catch(() => {});

                    logger.error("Instance", `Session ${this.sessionId} max reconnects reached. Auto-stopped.`);
                    this.onRemovedFromManager?.();
                }
            }

            if (connection === "open") {
                this.reconnectCount = 0;
                this.isStopped = false;
                this.status = "CONNECTED";
                this.qr = null;
                this.pairingCode = null;
                this.startTime = new Date();

                this.emitUpdate({ status: "CONNECTED", qr: null, user: this.socket?.user });

                try {
                    await syncGroups(this.socket as WASocket, this.sessionId);
                } catch (e) {
                    logger.error("Instance", "Group sync failed:", e);
                }

                bindAutoReply(this.socket as WASocket, this.sessionId);
                bindPpGuard(this.socket as WASocket, this.sessionId);

                await prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { status: "CONNECTED", qr: null }
                }).catch(() => {});

                logger.success("Instance", `Session ${this.sessionId} connected and synced successfully`);
            }
        } catch (error: any) {
            if (error.code === 'P2025') {
                logger.warn("Instance", `Session ${this.sessionId} record not found during update. Stopping.`);
                this.socket?.end(undefined);
                this.socket = null;
            } else {
                logger.error("Instance", "Error in handleConnectionUpdate:", error);
            }
        }
    }

    async requestPairingCode(phoneNumber: string) {
        if (!this.socket) {
            // If socket not initialized yet, try initializing
            await this.init();
        }

        if (!this.socket) {
            throw new Error("Socket not initialized");
        }

        try {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            if (!cleanNumber) throw new Error("Invalid phone number");

            const code = await this.socket.requestPairingCode(cleanNumber);
            this.pairingCode = code;
            this.status = "SCAN_QR";

            this.emitUpdate({
                status: this.status,
                qr: this.qr,
                pairingCode: code
            });

            return code;
        } catch (error) {
            logger.error("Instance", "Pairing code error:", error);
            throw error;
        }
    }

    /** Clean shutdown without triggering auto-reconnect */
    async shutdown() {
        this.isStopped = true;
        this.status = "STOPPED";
        this.qr = null;
        this.pairingCode = null;
        try {
            if (this.socket) {
                this.socket.ev.removeAllListeners("connection.update");
                this.socket.ev.removeAllListeners("creds.update");
                this.socket.end(undefined);
                this.socket = null;
            }
        } catch (e) {
            // ignore
        }
        this.reconnectCount = 0;
    }
}
