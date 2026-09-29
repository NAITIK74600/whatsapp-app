'use client';

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
    QrCode, 
    Smartphone, 
    RefreshCw, 
    CheckCircle2, 
    AlertCircle, 
    Copy, 
    Check, 
    ArrowRight, 
    ShieldCheck, 
    Clock, 
    ExternalLink,
    Loader2
} from "lucide-react";

interface CreateSessionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSessionCreated: (session: any) => void;
    userId: string;
    existingSessionId?: string | null; // If opening to view an existing session's QR
    existingSessionName?: string | null;
}

export function CreateSessionModal({
    open,
    onOpenChange,
    onSessionCreated,
    userId,
    existingSessionId,
    existingSessionName
}: CreateSessionModalProps) {
    const [step, setStep] = useState<'form' | 'connecting' | 'connected' | 'error'>('form');
    const [sessionName, setSessionName] = useState('');
    const [customId, setCustomId] = useState('');
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [pairingLoading, setPairingLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<'qr' | 'phone'>('qr');
    const [connectedAccount, setConnectedAccount] = useState<{ id?: string; name?: string } | null>(null);

    // QR countdown timer (45 seconds nominal expiration)
    const [qrExpiresIn, setQrExpiresIn] = useState<number>(45);

    const socketRef = useRef<Socket | null>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Reset or initialize modal state when opened
    useEffect(() => {
        if (!open) {
            // Cleanup on close
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }

        if (existingSessionId) {
            // Viewing existing session QR
            setActiveSessionId(existingSessionId);
            setSessionName(existingSessionName || existingSessionId);
            setStep('connecting');
            initSocket(existingSessionId);
            startPolling(existingSessionId);
        } else {
            // Creating new session
            setStep('form');
            setSessionName('');
            setCustomId('');
            setActiveSessionId(null);
            setQrCode(null);
            setPairingCode(null);
            setErrorMessage(null);
            setConnectedAccount(null);
        }
    }, [open, existingSessionId]);

    // QR Countdown timer
    useEffect(() => {
        if (step !== 'connecting' || !qrCode) return;
        setQrExpiresIn(45);
        const timer = setInterval(() => {
            setQrExpiresIn(prev => {
                if (prev <= 1) {
                    // Time up, request a QR refresh silently
                    if (activeSessionId) fetchQrCode(activeSessionId);
                    return 45;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [qrCode, step, activeSessionId]);

    const initSocket = (sessionId: string) => {
        if (socketRef.current) socketRef.current.disconnect();

        try {
            const socket = io({
                path: "/api/socket/io",
                addTrailingSlash: false,
                transports: ['websocket', 'polling']
            });

            socket.on('connect', () => {
                socket.emit('join-session', sessionId);
                if (userId) socket.emit('join-user-room', userId);
            });

            socket.on('connection.update', (data: any) => {
                if (!data) return;
                const matchSession = data.sessionId === sessionId || !data.sessionId;
                if (!matchSession) return;

                if (data.qr) {
                    setQrCode(data.qr);
                    setStep('connecting');
                    setErrorMessage(null);
                }

                if (data.pairingCode) {
                    setPairingCode(data.pairingCode);
                }

                if (data.status === 'CONNECTED') {
                    setStep('connected');
                    setConnectedAccount(data.user || null);
                    toast.success("WhatsApp account connected successfully!");
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                }

                if (data.status === 'FAILED') {
                    setStep('error');
                    setErrorMessage(data.error || "Session connection failed. Please retry.");
                }

                if (data.status === 'LOGGED_OUT') {
                    setStep('error');
                    setErrorMessage("Session was logged out. Please restart.");
                }
            });

            socketRef.current = socket;
        } catch (e) {
            console.warn("Socket init error, falling back to polling", e);
        }
    };

    const fetchQrCode = async (sessionId: string) => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}/qr`);
            const data = await res.json();
            if (data.success && data.data?.qr) {
                setQrCode(data.data.qr);
                if (data.data.pairingCode) setPairingCode(data.data.pairingCode);
            }
            if (data.data?.connected || data.data?.status === 'CONNECTED') {
                setStep('connected');
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            }
        } catch (e) {
            // silent ignore during polling
        }
    };

    const fetchStatus = async (sessionId: string) => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}/status`);
            const data = await res.json();
            if (data.success && data.data) {
                if (data.data.status === 'CONNECTED' || data.data.connected) {
                    setStep('connected');
                    setConnectedAccount(data.data.me || null);
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    return;
                }
                if (data.data.qrAvailable && !qrCode) {
                    fetchQrCode(sessionId);
                }
                if (data.data.status === 'FAILED') {
                    setStep('error');
                    setErrorMessage("Session initialization failed. Click retry to reconnect.");
                }
            }
        } catch (e) {
            // silent ignore
        }
    };

    const startPolling = (sessionId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        // Fetch immediately
        fetchQrCode(sessionId);
        fetchStatus(sessionId);

        // Then poll every 2 seconds
        pollIntervalRef.current = setInterval(() => {
            fetchStatus(sessionId);
            fetchQrCode(sessionId);
        }, 2000);
    };

    const handleCreateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = sessionName.trim();
        if (!trimmed) {
            toast.error("Please enter a session name");
            return;
        }
        if (trimmed.length < 2) {
            toast.error("Session name must be at least 2 characters");
            return;
        }

        setLoading(true);
        setErrorMessage(null);

        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: trimmed,
                    sessionId: customId.trim() || undefined
                })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                const msg = data.error?.message || data.message || "Failed to create session";
                throw new Error(msg);
            }

            const created = data.data;
            setActiveSessionId(created.sessionId);
            setStep('connecting');
            toast.success("Session created! Generating WhatsApp QR code...");

            onSessionCreated(created);

            // Start real-time listeners and polling
            initSocket(created.sessionId);
            startPolling(created.sessionId);

        } catch (err: any) {
            console.error("Session creation error:", err);
            toast.error(err.message || "Failed to create session");
            setErrorMessage(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshQr = async () => {
        if (!activeSessionId) return;
        setRefreshing(true);
        try {
            await fetch(`/api/sessions/${activeSessionId}/reconnect`, { method: 'POST' });
            setQrCode(null);
            setQrExpiresIn(45);
            toast.info("Regenerating QR code...");
            setTimeout(() => {
                fetchQrCode(activeSessionId);
            }, 1000);
        } catch (e) {
            toast.error("Failed to refresh session");
        } finally {
            setRefreshing(false);
        }
    };

    const handleGeneratePairingCode = async () => {
        if (!activeSessionId) return;
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (!cleanNumber || cleanNumber.length < 8) {
            toast.error("Please enter a valid international phone number (with country code)");
            return;
        }

        setPairingLoading(true);
        try {
            const res = await fetch(`/api/sessions/${activeSessionId}/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: cleanNumber })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || data.error?.message || "Failed to generate pairing code");
            }
            if (data.data?.pairingCode) {
                setPairingCode(data.data.pairingCode);
                toast.success("Pairing code generated! Check your phone notification.");
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to generate pairing code");
        } finally {
            setPairingLoading(false);
        }
    };

    const copyPairingCode = () => {
        if (!pairingCode) return;
        navigator.clipboard.writeText(pairingCode.replace(/-/g, ''));
        setCopied(true);
        toast.success("Pairing code copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    const formatPairingCode = (code: string) => {
        const clean = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (clean.length === 8) {
            return `${clean.slice(0, 4)}-${clean.slice(4)}`;
        }
        return code;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl bg-white dark:bg-slate-900">
                
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/20 shadow-sm">
                            <QrCode className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                                {step === 'form' ? 'Create WhatsApp Session' : 
                                 step === 'connected' ? 'WhatsApp Connected!' : 
                                 step === 'error' ? 'Connection Problem' : 
                                 'Link WhatsApp Account'}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {step === 'form' ? 'Add a new phone number to automate messages and chats.' :
                                 step === 'connected' ? 'Session is fully authenticated and ready for automation.' :
                                 step === 'error' ? 'There was an issue establishing the connection.' :
                                 `Session: ${sessionName}`}
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {/* STEP 1: FORM */}
                    {step === 'form' && (
                        <form onSubmit={handleCreateSession} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="modal-session-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Session Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="modal-session-name"
                                    placeholder="e.g. Sales Team WhatsApp, Customer Care"
                                    value={sessionName}
                                    onChange={(e) => setSessionName(e.target.value)}
                                    maxLength={50}
                                    autoFocus
                                    className="h-10 text-sm focus-visible:ring-emerald-500 border-slate-200 dark:border-slate-800"
                                />
                                <p className="text-[11px] text-slate-400">Give this session an identifiable label.</p>
                            </div>

                            <div className="space-y-2 pt-1">
                                <Label htmlFor="modal-custom-id" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                    Custom Session ID <span className="text-slate-400 text-[10px] font-normal">(Optional)</span>
                                </Label>
                                <Input
                                    id="modal-custom-id"
                                    placeholder="e.g. sales-line-1"
                                    value={customId}
                                    onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                                    maxLength={64}
                                    className="h-9 text-xs font-mono border-slate-200 dark:border-slate-800"
                                />
                                <p className="text-[10px] text-slate-400">Letters, numbers, hyphens only. If left empty, an ID will be generated.</p>
                            </div>

                            {errorMessage && (
                                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            <div className="pt-2">
                                <Button 
                                    type="submit" 
                                    disabled={loading || !sessionName.trim()} 
                                    className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Initializing Session...
                                        </>
                                    ) : (
                                        <>
                                            Create & Connect <ArrowRight className="h-4 w-4 ml-1.5" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    )}

                    {/* STEP 2: CONNECTING / QR / PAIRING */}
                    {step === 'connecting' && (
                        <div className="space-y-5">
                            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
                                <TabsList className="grid grid-cols-2 h-9 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
                                    <TabsTrigger value="qr" className="text-xs font-medium gap-1.5">
                                        <QrCode className="h-3.5 w-3.5" /> QR Code
                                    </TabsTrigger>
                                    <TabsTrigger value="phone" className="text-xs font-medium gap-1.5">
                                        <Smartphone className="h-3.5 w-3.5" /> Phone Number
                                    </TabsTrigger>
                                </TabsList>

                                {/* TAB 1: QR CODE */}
                                <TabsContent value="qr" className="mt-4 space-y-4">
                                    <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 relative">
                                        {qrCode ? (
                                            <div className="flex flex-col items-center">
                                                <div className="bg-white p-3.5 rounded-xl shadow-md border border-slate-100">
                                                    <QRCodeSVG 
                                                        value={qrCode} 
                                                        size={220} 
                                                        level="M"
                                                        includeMargin={false}
                                                    />
                                                </div>
                                                
                                                <div className="flex items-center gap-2 mt-3 text-xs text-slate-500 dark:text-slate-400">
                                                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                                                    <span>Refreshes in <strong className="text-slate-700 dark:text-slate-200 font-mono">{qrExpiresIn}s</strong></span>
                                                    <button 
                                                        onClick={handleRefreshQr}
                                                        disabled={refreshing}
                                                        className="ml-2 text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1 hover:underline text-[11px]"
                                                    >
                                                        <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
                                                        Refresh now
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="py-12 flex flex-col items-center justify-center gap-3">
                                                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                                                <div className="text-center">
                                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Generating WhatsApp QR Code...</p>
                                                    <p className="text-xs text-slate-400 mt-1">Connecting to WhatsApp gateway. Takes ~2-5 seconds.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Instructions */}
                                    <div className="rounded-xl p-3.5 bg-emerald-500/5 border border-emerald-500/15 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                                        <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                                            <ShieldCheck className="h-4 w-4" /> How to scan with WhatsApp:
                                        </div>
                                        <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400 pl-0.5">
                                            <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                                            <li>Tap <strong>Settings</strong> (iOS) or <strong>Menu ⋮</strong> (Android)</li>
                                            <li>Tap <strong>Linked Devices</strong> &rarr; <strong>Link a Device</strong></li>
                                            <li>Point your camera at this QR code to connect</li>
                                        </ol>
                                    </div>
                                </TabsContent>

                                {/* TAB 2: PHONE NUMBER PAIRING */}
                                <TabsContent value="phone" className="mt-4 space-y-4">
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="pairing-phone" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                Phone Number with Country Code
                                            </Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="pairing-phone"
                                                    placeholder="e.g. 628123456789 or 14155552671"
                                                    value={phoneNumber}
                                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                                    className="font-mono text-sm h-10"
                                                />
                                                <Button 
                                                    onClick={handleGeneratePairingCode}
                                                    disabled={pairingLoading || !phoneNumber.trim()}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 h-10 px-4 text-xs font-semibold"
                                                >
                                                    {pairingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Code"}
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-slate-400">Do not include +, spaces, or dashes (e.g. 919876543210).</p>
                                        </div>

                                        {pairingCode && (
                                            <div className="p-4 bg-slate-900 rounded-xl border border-slate-700 shadow-md text-center space-y-2">
                                                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                                                    WhatsApp Pairing Code
                                                </div>
                                                <div 
                                                    onClick={copyPairingCode}
                                                    className="text-3xl font-mono font-bold tracking-[0.2em] text-white hover:text-emerald-400 cursor-pointer transition-colors py-1 flex items-center justify-center gap-2"
                                                    title="Click to copy"
                                                >
                                                    {formatPairingCode(pairingCode)}
                                                    <span className="text-slate-400 hover:text-white p-1">
                                                        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-400">Enter this 8-digit code when prompted on your phone.</p>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}

                    {/* STEP 3: CONNECTED SUCCESS */}
                    {step === 'connected' && (
                        <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="h-16 w-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center animate-bounce shadow-sm">
                                <CheckCircle2 className="h-10 w-10" />
                            </div>

                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">WhatsApp Successfully Linked!</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                                    Your WhatsApp session is authenticated and live. You can now send messages, create bots, and automate conversations.
                                </p>
                            </div>

                            {connectedAccount && (
                                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300">
                                    Account: <span className="font-bold text-emerald-600">{connectedAccount.name || connectedAccount.id || "Active Device"}</span>
                                </div>
                            )}

                            <div className="pt-2 w-full flex gap-2">
                                <Button 
                                    onClick={() => onOpenChange(false)} 
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-10 rounded-xl"
                                >
                                    Done & Return to Dashboard
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: ERROR */}
                    {step === 'error' && (
                        <div className="py-4 text-center space-y-4">
                            <div className="h-12 w-12 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center mx-auto">
                                <AlertCircle className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Connection Failed</h3>
                                <p className="text-xs text-slate-500">{errorMessage || "An unexpected error occurred during session connection."}</p>
                            </div>

                            <div className="flex gap-2 justify-center pt-2">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setStep('form')}
                                    className="text-xs h-9 rounded-xl"
                                >
                                    Back to Form
                                </Button>
                                {activeSessionId && (
                                    <Button 
                                        onClick={handleRefreshQr}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 rounded-xl"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry Connection
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
