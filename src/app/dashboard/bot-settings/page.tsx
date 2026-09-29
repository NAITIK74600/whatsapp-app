"use client";

import { useState, useEffect } from "react";
import { useSession as useSessionProvider } from "@/components/dashboard/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Save, AlertCircle, Bot, X, Plus, ShieldCheck, Zap, UserCheck, MessageSquarePlus, CheckCircle2, Activity, Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { SessionGuard } from "@/components/dashboard/session-guard";

export default function BotSettingsPage() {
    const { sessionId } = useSessionProvider();

    const [botConfig, setBotConfig] = useState({
        botName: "WA-AKG Bot",
        prefix: "#",
        enableSticker: true,
        enableVideoSticker: true,
        maxStickerDuration: 10,
        enablePing: true,
        enableUptime: true,
        removeBgApiKey: "",
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

        // New fields
        enableWelcomeMessage: false,
        welcomeMessage: "",
        autoRead: false,
        alwaysOnline: false,
        aiEnabled: false,
        aiTriggerMode: "FALLBACK",
        aiProvider: "openrouter",
        aiApiKey: "",
        aiModel: "openai/gpt-4o-mini",
        aiApiUrl: "",
        aiSystemPrompt: "",
        botAllowedJids: [] as string[],
        botBlockedJids: [] as string[],
        autoReplyAllowedJids: [] as string[],
        autoReplyBlockedJids: [] as string[],
    });
    const [botLoading, setBotLoading] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [testAiLoading, setTestAiLoading] = useState(false);
    const [testAiResult, setTestAiResult] = useState<{ success: boolean; message: string; reply?: string } | null>(null);
    const [safetyAudit, setSafetyAudit] = useState<{
        score: number;
        status: "OPTIMAL" | "MODERATE" | "HIGH_RISK";
        todaySent: number;
        dailyLimit: number;
        optOutCount: number;
        checks: { id: string; title: string; passed: boolean; description: string; weight: number }[];
        recommendations: string[];
    } | null>(null);

    const [newJid, setNewJid] = useState("");

    const [privacyConfig, setPrivacyConfig] = useState({
        ghostMode: false,
        antiDelete: false,
        readReceipts: true,
    });
    const [privacyLoading, setPrivacyLoading] = useState(false);

    const fetchSafety = () => {
        if (!sessionId) return;
        fetch(`/api/sessions/${sessionId}/safety`)
            .then(res => res.json())
            .then(res => {
                if (res.data) setSafetyAudit(res.data);
            })
            .catch(() => {});
    };

    useEffect(() => {
        if (!sessionId) return;

        fetchSafety();

        fetch(`/api/sessions/${sessionId}/bot-config`)
            .then(res => { if (!res.ok) throw new Error(); return res.json(); })
            .then(responseData => {
                const data = responseData?.data;
                if (data && !responseData.error) {
                    setBotConfig(prev => ({
                        ...prev,
                        ...data,
                        removeBgApiKey: data.removeBgApiKey || "",
                        prefix: data.prefix || "#",
                        enableWelcomeMessage: data.enableWelcomeMessage || false,
                        welcomeMessage: data.welcomeMessage || "",
                        botAllowedJids: data.botAllowedJids || [],
                        botBlockedJids: data.botBlockedJids || [],
                        autoReplyAllowedJids: data.autoReplyAllowedJids || [],
                        autoReplyBlockedJids: data.autoReplyBlockedJids || [],
                        aiEnabled: data.aiEnabled || false,
                        aiTriggerMode: data.aiTriggerMode || "FALLBACK",
                        aiProvider: data.aiProvider || "openrouter",
                        aiApiKey: data.aiApiKey || "",
                        aiModel: data.aiModel || "openai/gpt-4o-mini",
                        aiApiUrl: data.aiApiUrl || "",
                        aiSystemPrompt: data.aiSystemPrompt || "",
                        antiSpamEnabled: data.antiSpamEnabled ?? true,
                        simulatePresence: data.simulatePresence ?? true,
                        autoOptOut: data.autoOptOut ?? true,
                        dailyLimit: data.dailyLimit || 500,
                    }));
                }
            })
            .catch(() => { });

        fetch(`/api/sessions/${sessionId}/settings`)
            .then(res => { if (!res.ok) throw new Error(); return res.json(); })
            .then(responseData => {
                const data = responseData?.data;
                if (data && !responseData.error) {
                    setPrivacyConfig({
                        ghostMode: data.config?.ghostMode || false,
                        antiDelete: data.config?.antiDelete || false,
                        readReceipts: data.config?.readReceipts ?? true
                    });
                }
            })
            .catch(() => { });
    }, [sessionId]);

    const applyPreset = async (preset: "ULTRA_SAFE" | "BALANCED" | "HIGH_VOLUME") => {
        if (!sessionId) return;
        setBotLoading(true);
        try {
            const res = await fetch(`/api/sessions/${sessionId}/safety`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preset })
            });
            const data = await res.json();
            if (data.status) {
                toast.success(`Applied ${preset.replace("_", " ")} safety preset!`);
                if (data.data) {
                    setBotConfig(prev => ({ ...prev, ...data.data }));
                }
                fetchSafety();
            } else {
                toast.error(data.message || "Failed to apply safety preset");
            }
        } catch {
            toast.error("Network error applying preset");
        } finally {
            setBotLoading(false);
        }
    };

    const handleSaveBot = async () => {
        if (!sessionId) return;
        setBotLoading(true);
        try {
            const res = await fetch(`/api/sessions/${sessionId}/bot-config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(botConfig)
            });

            if (res.ok) {
                toast.success("Bot & Safety configuration saved");
                fetchSafety();
            } else {
                toast.error("Failed to save configuration");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error saving bot configuration");
        } finally {
            setBotLoading(false);
        }
    };

    const handleSavePrivacy = async () => {
        if (!sessionId) return;
        setPrivacyLoading(true);
        try {
            const res = await fetch(`/api/sessions/${sessionId}/settings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: {
                        ghostMode: privacyConfig.ghostMode,
                        antiDelete: privacyConfig.antiDelete,
                        readReceipts: privacyConfig.readReceipts
                    }
                })
            });

            if (res.ok) {
                toast.success("Privacy settings saved");
            } else {
                toast.error("Failed to save privacy settings");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error saving privacy settings");
        } finally {
            setPrivacyLoading(false);
        }
    };

    const handleTestAi = async () => {
        if (!sessionId) return;
        setTestAiLoading(true);
        setTestAiResult(null);
        try {
            const res = await fetch(`/api/sessions/${sessionId}/test-ai`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    aiProvider: botConfig.aiProvider,
                    aiApiKey: botConfig.aiApiKey,
                    aiModel: botConfig.aiModel,
                    aiApiUrl: botConfig.aiProvider === "custom" ? botConfig.aiApiUrl : "",
                })
            });
            const data = await res.json();
            if (data.status) {
                setTestAiResult({
                    success: true,
                    message: `Verified! Provider: ${data.data?.provider || botConfig.aiProvider} (${data.data?.model || botConfig.aiModel})`,
                    reply: data.data?.reply
                });
                toast.success("AI connection verified successfully!");
            } else {
                setTestAiResult({
                    success: false,
                    message: data.message || "Failed to connect to AI provider"
                });
                toast.error(data.message || "AI test failed");
            }
        } catch (e: any) {
            setTestAiResult({
                success: false,
                message: e?.message || "Network error testing AI"
            });
            toast.error("Network error testing AI");
        } finally {
            setTestAiLoading(false);
        }
    };

    const addJid = (listName: 'botAllowedJids' | 'botBlockedJids' | 'autoReplyAllowedJids' | 'autoReplyBlockedJids') => {
        if (!newJid || !newJid.trim()) return;
        let formatted = newJid.trim();
        if (!formatted.includes('@')) formatted += '@s.whatsapp.net';

        if (!botConfig[listName].includes(formatted)) {
            setBotConfig(prev => ({
                ...prev,
                [listName]: [...prev[listName], formatted]
            }));
        }
        setNewJid("");
    };

    const removeJid = (listName: 'botAllowedJids' | 'botBlockedJids' | 'autoReplyAllowedJids' | 'autoReplyBlockedJids', jid: string) => {
        setBotConfig(prev => ({
            ...prev,
            [listName]: prev[listName].filter(item => item !== jid)
        }));
    };

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    return (
        <SessionGuard>
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Bot Settings</h2>
                    <p className="text-muted-foreground text-sm mt-1">Configure bot features and session privacy for the active WhatsApp session.</p>
                </div>

                {/* Bot Mode & Access Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            Bot Mode & Access Control
                        </CardTitle>
                        <CardDescription>Configure who can interact with the bot and use commands.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                            <div className="grid gap-2">
                                <Label>Bot Name</Label>
                                <Input
                                    placeholder="WA-AKG Bot"
                                    value={botConfig.botName}
                                    onChange={(e) => setBotConfig(prev => ({ ...prev, botName: e.target.value }))}
                                />
                                <p className="text-xs text-muted-foreground">The display name used by the bot in automated responses.</p>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Command Prefix</Label>
                                    <Input
                                        className="max-w-[100px]"
                                        placeholder="#"
                                        maxLength={3}
                                        value={botConfig.prefix}
                                        onChange={(e) => setBotConfig(prev => ({ ...prev, prefix: e.target.value }))}
                                    />
                                    <p className="text-xs text-muted-foreground">The prefix character for bot commands.</p>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Bot Interaction Mode</Label>
                                    <Select
                                        value={botConfig.botMode}
                                        onValueChange={(v: any) => setBotConfig(prev => ({ ...prev, botMode: v }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">Public (Everyone)</SelectItem>
                                            <SelectItem value="OWNER">Private (Owner Only)</SelectItem>
                                            <SelectItem value="SPECIFIC">Whitelist (Selected JIDs)</SelectItem>
                                            <SelectItem value="BLACKLIST">Blacklist (Block JIDs)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">Control who can trigger bot commands.</p>
                                </div>
                            </div>

                            {(botConfig.botMode === 'SPECIFIC' || botConfig.botMode === 'BLACKLIST') && (
                                <div className="space-y-4 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Label className="flex items-center gap-2">
                                        <UserCheck className="h-4 w-4" />
                                        {botConfig.botMode === 'SPECIFIC' ? "Whitelisted Numbers" : "Blacklisted Numbers"}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="628123456789@s.whatsapp.net"
                                            value={newJid}
                                            onChange={(e) => setNewJid(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addJid(botConfig.botMode === 'SPECIFIC' ? 'botAllowedJids' : 'botBlockedJids')}
                                        />
                                        <Button variant="outline" size="icon" onClick={() => addJid(botConfig.botMode === 'SPECIFIC' ? 'botAllowedJids' : 'botBlockedJids')}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {(botConfig.botMode === 'SPECIFIC' ? botConfig.botAllowedJids : botConfig.botBlockedJids).map(jid => (
                                            <div key={jid} className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs font-medium">
                                                {jid}
                                                <button onClick={() => removeJid(botConfig.botMode === 'SPECIFIC' ? 'botAllowedJids' : 'botBlockedJids', jid)} className="text-muted-foreground hover:text-destructive transition-colors">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {(botConfig.botMode === 'SPECIFIC' ? botConfig.botAllowedJids : botConfig.botBlockedJids).length === 0 && (
                                            <p className="text-xs text-muted-foreground italic">No numbers added yet.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-border/50">
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="enable-ping" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium">Ping Command</span>
                                        <span className="font-normal text-[10px] text-muted-foreground">Respond to {botConfig.prefix}ping</span>
                                    </Label>
                                    <Switch id="enable-ping" checked={botConfig.enablePing}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, enablePing: c }))} />
                                </div>
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="enable-uptime" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium">Uptime Command</span>
                                        <span className="font-normal text-[10px] text-muted-foreground">Respond to {botConfig.prefix}uptime</span>
                                    </Label>
                                    <Switch id="enable-uptime" checked={botConfig.enableUptime}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, enableUptime: c }))} />
                                </div>
                            </div>

                            <div className="pt-2">
                                <Button className="w-full sm:w-auto" onClick={handleSaveBot} disabled={botLoading || !sessionId}>
                                    {botLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Bot Configuration
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Automation & Presence Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="h-5 w-5 text-yellow-500" />
                                Automation & Presence
                            </CardTitle>
                            <CardDescription>Advanced bot automation and presence customization.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="always-online" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium">Always Online</span>
                                        <span className="font-normal text-[10px] text-muted-foreground">Stay "Online" even when inactive.</span>
                                    </Label>
                                    <Switch id="always-online" checked={botConfig.alwaysOnline}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, alwaysOnline: c }))} />
                                </div>
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="auto-read" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium">Auto Read (Blue Ticks)</span>
                                        <span className="font-normal text-[10px] text-muted-foreground">Automatically mark messages as read.</span>
                                    </Label>
                                    <Switch id="auto-read" checked={botConfig.autoRead}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, autoRead: c }))} />
                                </div>
                            </div>

                            {/* Welcome Message Control */}
                            <div className="space-y-4 border-t border-border/50 pt-4">
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="enable-welcome" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium flex items-center gap-1.5">
                                            <MessageSquarePlus className="h-4 w-4 text-primary" />
                                            Enable Welcome Message
                                        </span>
                                        <span className="font-normal text-[10px] text-muted-foreground">
                                            Automatically greet new contacts on their first incoming message.
                                        </span>
                                    </Label>
                                    <Switch
                                        id="enable-welcome"
                                        checked={botConfig.enableWelcomeMessage}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, enableWelcomeMessage: c }))}
                                    />
                                </div>

                                {botConfig.enableWelcomeMessage && (
                                    <div className="space-y-2 animate-in fade-in duration-200">
                                        <Label>Welcome Message Text</Label>
                                        <Textarea
                                            placeholder="Grüezi und herzlich willkommen! Wie können wir Ihnen helfen?"
                                            className="min-h-[120px]"
                                            value={botConfig.welcomeMessage}
                                            onChange={(e) => setBotConfig(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            Supports paragraph breaks (press Enter) and WhatsApp formatting (*bold*, _italic_). Only sent to private chats.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* AI Auto-Reply Control */}
                            <div className="space-y-4 border-t border-border/50 pt-4">
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="ai-enabled" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium flex items-center gap-1.5">
                                            <Sparkles className="h-4 w-4 text-primary" />
                                            AI Auto-Reply
                                        </span>
                                        <span className="font-normal text-[10px] text-muted-foreground">
                                            Generate smart responses using OpenRouter, OpenAI, or compatible AI APIs.
                                        </span>
                                    </Label>
                                    <Switch
                                        id="ai-enabled"
                                        checked={botConfig.aiEnabled}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, aiEnabled: c }))}
                                    />
                                </div>

                                {botConfig.aiEnabled && (
                                    <div className="grid gap-4 animate-in fade-in slide-in-from-top-1 duration-200 p-4 border rounded-xl bg-muted/20">
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <div className="grid gap-2">
                                                <Label>AI Provider</Label>
                                                <Select
                                                    value={botConfig.aiProvider}
                                                    onValueChange={(v: string) => {
                                                        let defaultModel = botConfig.aiModel;
                                                        if (v === "gemini") {
                                                            if (!defaultModel?.toLowerCase().includes("gemini")) {
                                                                defaultModel = "gemini-2.0-flash";
                                                            } else if (defaultModel.includes("/")) {
                                                                defaultModel = defaultModel.split("/").pop() || "gemini-2.0-flash";
                                                            }
                                                        } else if (v === "openrouter" && !defaultModel?.includes("/")) {
                                                            defaultModel = "openai/gpt-4o-mini";
                                                        } else if (v === "openai" && defaultModel?.includes("/")) {
                                                            defaultModel = defaultModel.split("/").pop() || "gpt-4o-mini";
                                                        }
                                                        setBotConfig(prev => ({
                                                            ...prev,
                                                            aiProvider: v,
                                                            aiModel: defaultModel,
                                                            aiApiUrl: v === "custom" ? prev.aiApiUrl : ""
                                                        }));
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Provider" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="gemini">Google Gemini (Free Tier - AI Studio)</SelectItem>
                                                        <SelectItem value="openrouter">OpenRouter (Recommended - Any Model)</SelectItem>
                                                        <SelectItem value="openai">OpenAI Official</SelectItem>
                                                        <SelectItem value="custom">Custom Compatible API</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {botConfig.aiProvider === "gemini"
                                                        ? "Google AI Studio offers a free tier (up to 1,500 requests/day, 15 RPM). No credit card required."
                                                        : botConfig.aiProvider === "openrouter"
                                                            ? "OpenRouter gives access to GPT-4o, Claude 3.5, Gemini 2.0 Flash, Llama 3.3, and more."
                                                            : "Direct OpenAI API integration."}
                                                </p>
                                            </div>

                                            <div className="grid gap-2">
                                                <Label>AI Model</Label>
                                                <Input
                                                    placeholder={
                                                        botConfig.aiProvider === "gemini"
                                                            ? "gemini-2.0-flash (Recommended) or gemini-1.5-flash"
                                                            : botConfig.aiProvider === "openrouter"
                                                                ? "e.g. openai/gpt-4o-mini or google/gemini-2.0-flash-001"
                                                                : "gpt-4o-mini"
                                                    }
                                                    value={botConfig.aiModel}
                                                    onChange={(e) => setBotConfig(prev => ({ ...prev, aiModel: e.target.value }))}
                                                />
                                                <p className="text-[10px] text-muted-foreground">
                                                    {botConfig.aiProvider === "gemini"
                                                        ? "Recommended free models: gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro"
                                                        : botConfig.aiProvider === "openrouter"
                                                            ? "Examples: openai/gpt-4o-mini, google/gemini-2.0-flash-001, meta-llama/llama-3.3-70b-instruct"
                                                            : "Default: gpt-4o-mini"}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid gap-2">
                                            <Label className="flex items-center justify-between">
                                                <span>API Key</span>
                                                <span className="text-[10px] text-muted-foreground font-normal">
                                                    {botConfig.aiApiKey ? "Configured in session" : "Falls back to AI_API_KEY env if empty"}
                                                </span>
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    type={showApiKey ? "text" : "password"}
                                                    placeholder={
                                                        botConfig.aiProvider === "gemini"
                                                            ? "AIzaSy... (Paste Google AI Studio Key)"
                                                            : botConfig.aiProvider === "openrouter"
                                                                ? "sk-or-v1-..."
                                                                : "sk-..."
                                                    }
                                                    value={botConfig.aiApiKey}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const trimmed = val.trim();
                                                        setBotConfig(prev => {
                                                            const next = { ...prev, aiApiKey: val };
                                                            if (trimmed.startsWith("AIzaSy") && prev.aiProvider !== "gemini") {
                                                                next.aiProvider = "gemini";
                                                                next.aiModel = "gemini-2.0-flash";
                                                            } else if (trimmed.startsWith("sk-or-") && prev.aiProvider !== "openrouter") {
                                                                next.aiProvider = "openrouter";
                                                                if (!prev.aiModel?.includes("/")) {
                                                                    next.aiModel = "openai/gpt-4o-mini";
                                                                }
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                    className="pr-10 font-mono text-xs"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                    onClick={() => setShowApiKey(prev => !prev)}
                                                >
                                                    {showApiKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                                                </Button>
                                            </div>
                                            {botConfig.aiProvider === "gemini" ? (
                                                <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                                    <span>Get your free Gemini API key:</span>
                                                    <a
                                                        href="https://aistudio.google.com/app/apikey"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary underline font-medium hover:opacity-80"
                                                    >
                                                        Google AI Studio (100% Free) &rarr;
                                                    </a>
                                                </p>
                                            ) : (
                                                <p className="text-[10px] text-muted-foreground">
                                                    Keys starting with <code className="bg-muted px-1 rounded">sk-or-</code> auto-connect to OpenRouter; keys starting with <code className="bg-muted px-1 rounded">AIzaSy</code> connect to Google Gemini.
                                                </p>
                                            )}
                                        </div>

                                        {botConfig.aiProvider === "custom" && (
                                            <div className="grid gap-2">
                                                <Label>Custom Endpoint URL</Label>
                                                <Input
                                                    placeholder="https://api.example.com/v1/chat/completions"
                                                    value={botConfig.aiApiUrl}
                                                    onChange={(e) => setBotConfig(prev => ({ ...prev, aiApiUrl: e.target.value }))}
                                                />
                                            </div>
                                        )}

                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleTestAi}
                                                disabled={testAiLoading}
                                                className="gap-1.5"
                                            >
                                                {testAiLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                                                Test AI Connection
                                            </Button>
                                            {testAiResult && (
                                                <div className={`text-xs px-2.5 py-1 rounded border flex items-center gap-1.5 ${testAiResult.success ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                                                    {testAiResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                                                    <span>{testAiResult.message}</span>
                                                </div>
                                            )}
                                        </div>
                                        {testAiResult?.reply && (
                                            <div className="text-xs bg-card p-3 rounded-lg border">
                                                <span className="font-semibold text-muted-foreground block text-[10px] uppercase tracking-wider mb-1">Live AI Test Reply:</span>
                                                <p className="italic text-foreground">{testAiResult.reply}</p>
                                            </div>
                                        )}

                                        <div className="grid gap-2 pt-2 border-t">
                                            <Label>AI Trigger Mode</Label>
                                            <Select
                                                value={botConfig.aiTriggerMode}
                                                onValueChange={(v: any) => setBotConfig(prev => ({ ...prev, aiTriggerMode: v }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select when AI should reply" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="FALLBACK">Fallback only (when no keyword rule matches)</SelectItem>
                                                    <SelectItem value="ALWAYS">Always reply to all allowed messages</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                Fallback mode ensures your fixed keyword rules always reply first. Only unrecognized questions go to AI.
                                            </p>
                                        </div>

                                        <div className="grid gap-2">
                                            <Label>AI System Prompt</Label>
                                            <Textarea
                                                placeholder="Du bist der freundliche und professionelle WhatsApp-Assistent von Easy Motors Biel..."
                                                className="min-h-[140px]"
                                                value={botConfig.aiSystemPrompt}
                                                onChange={(e) => setBotConfig(prev => ({ ...prev, aiSystemPrompt: e.target.value }))}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Set business identity, store location, opening hours, tone, and guidance for your WhatsApp AI assistant.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2">
                                <Button className="w-full sm:w-auto" onClick={handleSaveBot} disabled={botLoading || !sessionId}>
                                    {botLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Automation Settings
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Media & Stickers Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Media & Stickers</CardTitle>
                            <CardDescription>Configure how the bot handles media and sticker conversion.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="enable-sticker" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium">Image to Sticker</span>
                                        <span className="font-normal text-xs text-muted-foreground">Auto-convert images</span>
                                    </Label>
                                    <Switch id="enable-sticker" checked={botConfig.enableSticker}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, enableSticker: c }))} />
                                </div>
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <Label htmlFor="enable-video-sticker" className="flex flex-col space-y-1 cursor-pointer">
                                        <span className="font-medium">Video to Sticker</span>
                                        <span className="font-normal text-xs text-muted-foreground">Auto-convert short videos</span>
                                    </Label>
                                    <Switch id="enable-video-sticker" checked={botConfig.enableVideoSticker}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, enableVideoSticker: c }))} />
                                </div>
                            </div>

                            <div className="grid gap-2 border-t border-border/50 pt-4">
                                <Label>Max Sticker Video Duration: <strong>{botConfig.maxStickerDuration}s</strong></Label>
                                <Slider
                                    value={[botConfig.maxStickerDuration]}
                                    onValueChange={([v]) => setBotConfig(prev => ({ ...prev, maxStickerDuration: v }))}
                                    min={3}
                                    max={30}
                                    step={1}
                                />
                                <p className="text-xs text-muted-foreground">Maximum video duration (in seconds) allowed for sticker conversion.</p>
                            </div>

                            <div className="grid gap-2 border-t border-border/50 pt-4">
                                <Label>Remove.bg API Key (Optional)</Label>
                                <Input
                                    type="password"
                                    placeholder="Enter your Remove.bg API Key"
                                    value={botConfig.removeBgApiKey || ""}
                                    onChange={(e) => setBotConfig(prev => ({ ...prev, removeBgApiKey: e.target.value }))}
                                />
                                <p className="text-xs text-muted-foreground">Enables background removal for stickers (use <code className="bg-muted px-1 rounded">nobg</code> caption).</p>
                            </div>

                            <div className="pt-2">
                                <Button className="w-full sm:w-auto" onClick={handleSaveBot} disabled={botLoading || !sessionId}>
                                    {botLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Media Settings
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Anti-Ban & Safety Protection */}
                    <Card className="border-orange-500/30 shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                    <ShieldCheck className="h-5 w-5" />
                                    WhatsApp Ban Protection & Safety Suite
                                </CardTitle>
                                {safetyAudit && (
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ${
                                            safetyAudit.status === "OPTIMAL" 
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                                                : safetyAudit.status === "MODERATE"
                                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                                : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                                        }`}>
                                            <Activity className="h-3.5 w-3.5" />
                                            Safety Score: {safetyAudit.score}/100 ({safetyAudit.status})
                                        </span>
                                    </div>
                                )}
                            </div>
                            <CardDescription>
                                Protect your WhatsApp number from automated detection, spam reporting, and account bans using intelligent queueing, human typing presence simulation, automatic opt-out compliance, and quota throttling.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Safety Score & Quota Overview */}
                            {safetyAudit && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-muted/40 border">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground font-medium">Health Status</span>
                                        <span className="text-base font-bold text-foreground flex items-center gap-1.5">
                                            {safetyAudit.status === "OPTIMAL" ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            ) : (
                                                <AlertCircle className="h-4 w-4 text-amber-500" />
                                            )}
                                            {safetyAudit.status === "OPTIMAL" ? "Optimal Protection" : safetyAudit.status === "MODERATE" ? "Moderate Risk" : "High Ban Risk"}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground font-medium">Today&apos;s Volume Meter</span>
                                        <span className="text-base font-bold text-foreground">
                                            {safetyAudit.todaySent} / {safetyAudit.dailyLimit} msgs
                                        </span>
                                        <div className="w-full bg-muted-foreground/20 rounded-full h-1.5 overflow-hidden mt-1">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-300 ${
                                                    (safetyAudit.todaySent / safetyAudit.dailyLimit) > 0.9 ? 'bg-red-500' : 'bg-emerald-500'
                                                }`} 
                                                style={{ width: `${Math.min(100, Math.round((safetyAudit.todaySent / safetyAudit.dailyLimit) * 100))}%` }} 
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground font-medium">Opted-Out Contacts</span>
                                        <span className="text-base font-bold text-foreground">
                                            {safetyAudit.optOutCount} recipients
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">Blacklisted to prevent spam reports</span>
                                    </div>
                                </div>
                            )}

                            {/* 1-Click Quick Safety Presets */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    1-Click Ban Protection Presets
                                </Label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-auto py-2.5 px-3 flex flex-col items-start gap-1 text-left border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/5"
                                        onClick={() => applyPreset("ULTRA_SAFE")}
                                        disabled={botLoading}
                                    >
                                        <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                                            <ShieldCheck className="h-3.5 w-3.5" />
                                            Ultra-Safe (Warmup)
                                        </div>
                                        <span className="text-[11px] text-muted-foreground leading-tight">
                                            3 msgs/15s • 3-6s delay • Max 200/day. Best for new numbers.
                                        </span>
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-auto py-2.5 px-3 flex flex-col items-start gap-1 text-left border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/5"
                                        onClick={() => applyPreset("BALANCED")}
                                        disabled={botLoading}
                                    >
                                        <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-600 dark:text-blue-400">
                                            <Zap className="h-3.5 w-3.5" />
                                            Standard Safe (Default)
                                        </div>
                                        <span className="text-[11px] text-muted-foreground leading-tight">
                                            5 msgs/10s • 1.5-3.5s delay • Max 500/day. Recommended for normal operations.
                                        </span>
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-auto py-2.5 px-3 flex flex-col items-start gap-1 text-left border-purple-500/30 hover:border-purple-500 hover:bg-purple-500/5"
                                        onClick={() => applyPreset("HIGH_VOLUME")}
                                        disabled={botLoading}
                                    >
                                        <div className="flex items-center gap-1.5 font-semibold text-xs text-purple-600 dark:text-purple-400">
                                            <Activity className="h-3.5 w-3.5" />
                                            High Volume (Aged)
                                        </div>
                                        <span className="text-[11px] text-muted-foreground leading-tight">
                                            8 msgs/10s • 1-2.5s delay • Max 1200/day. For aged active numbers.
                                        </span>
                                    </Button>
                                </div>
                            </div>

                            {/* Main Safety Toggles */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-orange-500/5 border-orange-500/20">
                                    <Label htmlFor="anti-spam" className="flex flex-col space-y-1">
                                        <span className="font-semibold text-orange-700 dark:text-orange-400">Enable Anti-Spam Queue & Random Jitter</span>
                                        <span className="font-normal text-xs text-muted-foreground">Queues messages and applies intelligent random delays if outbound velocity spikes. Messages are safely throttled without being lost.</span>
                                    </Label>
                                    <Switch id="anti-spam" checked={botConfig.antiSpamEnabled}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, antiSpamEnabled: c }))} />
                                </div>

                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-emerald-500/5 border-emerald-500/20">
                                    <Label htmlFor="simulate-presence" className="flex flex-col space-y-1">
                                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">Simulate Human Typing Presence (&apos;composing&apos;)</span>
                                        <span className="font-normal text-xs text-muted-foreground">Dispatches real WhatsApp typing indicators (1-2.5s) to Meta protocol servers before sending messages. Eradicates the 0ms automated bot footprint.</span>
                                    </Label>
                                    <Switch id="simulate-presence" checked={botConfig.simulatePresence}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, simulatePresence: c }))} />
                                </div>

                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-blue-500/5 border-blue-500/20">
                                    <Label htmlFor="auto-opt-out" className="flex flex-col space-y-1">
                                        <span className="font-semibold text-blue-700 dark:text-blue-400">Automatic STOP / Opt-Out Compliance</span>
                                        <span className="font-normal text-xs text-muted-foreground">Automatically respects keywords (STOP, UNSUBSCRIBE, BERHENTI, BATAL) by blacklisting contacts and sending polite unsubscribe confirmation. Slashes recipient spam reports.</span>
                                    </Label>
                                    <Switch id="auto-opt-out" checked={botConfig.autoOptOut}
                                        onCheckedChange={c => setBotConfig(prev => ({ ...prev, autoOptOut: c }))} />
                                </div>
                            </div>

                            {/* Granular Parameters */}
                            {botConfig.antiSpamEnabled && (
                                <div className="grid gap-6 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="grid sm:grid-cols-3 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="font-semibold">Messages Threshold</Label>
                                            <Input
                                                type="number"
                                                value={botConfig.spamLimit}
                                                onChange={e => setBotConfig(prev => ({ ...prev, spamLimit: parseInt(e.target.value) || 1 }))}
                                                min={1}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Allowed at full speed before delay kicks in.
                                            </p>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="font-semibold">Time Window (Seconds)</Label>
                                            <Input
                                                type="number"
                                                value={botConfig.spamInterval}
                                                onChange={e => setBotConfig(prev => ({ ...prev, spamInterval: parseInt(e.target.value) || 1 }))}
                                                min={1}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Rolling window to track velocity.
                                            </p>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="font-semibold">Daily Volume Limit</Label>
                                            <Input
                                                type="number"
                                                value={botConfig.dailyLimit}
                                                onChange={e => setBotConfig(prev => ({ ...prev, dailyLimit: parseInt(e.target.value) || 100 }))}
                                                min={50}
                                                step={50}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Max daily messages before safety cooldown applies.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="font-semibold">Min Jitter Delay (ms)</Label>
                                            <Input
                                                type="number"
                                                value={botConfig.spamDelayMin}
                                                onChange={e => setBotConfig(prev => ({ ...prev, spamDelayMin: parseInt(e.target.value) || 0 }))}
                                                min={0}
                                                step={100}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Minimum random delay applied. 1500ms = 1.5 seconds.
                                            </p>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="font-semibold">Max Jitter Delay (ms)</Label>
                                            <Input
                                                type="number"
                                                value={botConfig.spamDelayMax}
                                                onChange={e => setBotConfig(prev => ({ ...prev, spamDelayMax: parseInt(e.target.value) || 0 }))}
                                                min={0}
                                                step={100}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Maximum random delay applied. 3500ms = 3.5 seconds.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Ban Prevention Tips Banner */}
                                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                            <CheckCircle2 className="h-4 w-4" />
                                            Golden Rules for WhatsApp Account Safety
                                        </p>
                                        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                                            <li><strong>Warm Up Fresh Numbers:</strong> Start with &lt; 50 messages/day on new SIM cards. Double every 4 days.</li>
                                            <li><strong>Never Blast Cold Lists:</strong> Only message users who opted in or have your number saved in their contacts.</li>
                                            <li><strong>Respect Opt-Out:</strong> Never bypass the STOP/Unsubscribe mechanism. Recipient reports cause 95% of WhatsApp bans.</li>
                                            <li><strong>Use Human Jitter:</strong> Fixed intervals (e.g. exactly 2.0s between each message) are detected by machine learning spam filters.</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2">
                                <Button onClick={handleSaveBot} disabled={botLoading || !sessionId}>
                                    {botLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Ban Protection Settings
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Privacy & Utility */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Privacy & Utility</CardTitle>
                            <CardDescription>Configure ghost mode and other features for your active session.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="ghost-mode" className="flex flex-col space-y-1">
                                    <span>Ghost Mode</span>
                                    <span className="font-normal text-xs text-muted-foreground">View status and read messages without sending blue ticks.</span>
                                </Label>
                                <Switch id="ghost-mode" checked={privacyConfig.ghostMode}
                                    onCheckedChange={c => setPrivacyConfig(prev => ({ ...prev, ghostMode: c }))} />
                            </div>

                            <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="anti-delete" className="flex flex-col space-y-1">
                                    <span>Anti-Delete</span>
                                    <span className="font-normal text-xs text-muted-foreground">Keep messages even if the sender deletes them for everyone.</span>
                                </Label>
                                <Switch id="anti-delete" checked={privacyConfig.antiDelete}
                                    onCheckedChange={c => setPrivacyConfig(prev => ({ ...prev, antiDelete: c }))} />
                            </div>

                            <div className="pt-4">
                                <Button onClick={handleSavePrivacy} disabled={privacyLoading || !sessionId}>
                                    {privacyLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Privacy Settings
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </SessionGuard>
        );
    }
