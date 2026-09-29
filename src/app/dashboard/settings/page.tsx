"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Save, AlertCircle, Sparkles, Globe, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
    const { data: authSession, status } = useSession();
    const router = useRouter();
    const isSuperAdmin = (authSession?.user as any)?.role === "SUPERADMIN";

    useEffect(() => {
        if (status !== "loading" && !isSuperAdmin) {
            router.replace("/dashboard");
        }
    }, [status, isSuperAdmin, router]);

    if (status !== "loading" && !isSuperAdmin) {
        return (
            <div className="p-8 max-w-xl mx-auto my-12 text-center rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive space-y-3">
                <ShieldAlert className="h-10 w-10 mx-auto text-destructive" />
                <h2 className="text-xl font-bold">Access Restricted</h2>
                <p className="text-sm text-muted-foreground">
                    System settings can only be accessed and managed by the Platform Super Administrator.
                </p>
            </div>
        );
    }

    const [systemConfig, setSystemConfig] = useState({
        appName: "WhatsApp Bot",
        baseUrl: "",
        logoUrl: "",
        faviconUrl: "/favicon.ico",
        timezone: "Asia/Jakarta",
        enableRegistration: true,
        aiProvider: "gemini",
        aiApiKey: "",
        aiModel: "gemini-2.5-flash",
        aiSystemPrompt: ""
    });
    const [systemLoading, setSystemLoading] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [timezones, setTimezones] = useState<string[]>(["UTC", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);

    useEffect(() => {
        try {
            if (typeof Intl !== "undefined" && Intl.supportedValuesOf) {
                const list = Intl.supportedValuesOf("timeZone");
                if (!list.includes("UTC")) {
                    list.push("UTC");
                }
                list.sort();
                setTimezones(list);
            }
        } catch (e) {
            console.error("Failed to load timezones dynamically", e);
        }
    }, []);

    useEffect(() => {
        fetch('/api/settings/system')
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(responseData => {
                const data = responseData?.data;
                if (data && !responseData.error) {
                    setSystemConfig({
                        appName: (data.appName && data.appName !== "WA-AKG") ? data.appName : "WhatsApp Bot",
                        baseUrl: data.baseUrl || "",
                        logoUrl: data.logoUrl || "",
                        faviconUrl: data.faviconUrl || "/favicon.ico",
                        timezone: data.timezone || "Asia/Jakarta",
                        enableRegistration: data.enableRegistration !== undefined ? data.enableRegistration : true,
                        aiProvider: data.aiProvider || "gemini",
                        aiApiKey: data.aiApiKey || "",
                        aiModel: data.aiModel || "gemini-2.5-flash",
                        aiSystemPrompt: data.aiSystemPrompt || ""
                    });
                }
            })
            .catch(() => { });
    }, []);

    const handleSaveSystem = async () => {
        setSystemLoading(true);
        try {
            const res = await fetch('/api/settings/system', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(systemConfig)
            });

            if (res.ok) {
                toast.success("Global settings saved successfully!");
            } else {
                toast.error("Failed to update system settings");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error saving system settings");
        } finally {
            setSystemLoading(false);
        }
    };

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground text-sm mt-1">Global system configuration. Only SuperAdmins can make changes.</p>
            </div>

            {!isSuperAdmin && (
                <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">View Only Mode</p>
                                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                                    Only Superadmins can modify system settings. You can view current settings but cannot make changes.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* System Configuration (Global) */}
            <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <CardTitle className="text-xl">App Configuration</CardTitle>
                    <CardDescription>Global settings for the application branding, domain URL, and access control.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Application Name</Label>
                            <input
                                className={inputClass}
                                placeholder="WhatsApp Bot"
                                value={systemConfig.appName}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, appName: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">Changes the name in the sidebar and browser title.</p>
                        </div>

                        <div className="grid gap-2">
                            <Label>Timezone</Label>
                            <select
                                className={inputClass}
                                value={systemConfig.timezone}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, timezone: e.target.value }))}
                                disabled={!isSuperAdmin}
                            >
                                {timezones.map((tz) => (
                                    <option key={tz} value={tz}>
                                        {tz}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">Scheduler will use this timezone.</p>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-1.5">
                                <Globe className="h-4 w-4 text-primary" />
                                Public Base / Domain URL
                            </Label>
                            <span className="text-[10px] text-muted-foreground font-mono">Replaces localhost:3000 in onboarding messages</span>
                        </div>
                        <input
                            className={`${inputClass} font-mono text-xs`}
                            placeholder="https://azure-dinosaur-903216.hostingersite.com"
                            value={systemConfig.baseUrl}
                            onChange={(e) => setSystemConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                            disabled={!isSuperAdmin}
                        />
                        <p className="text-xs text-muted-foreground">
                            Set your live server domain URL here (e.g. <code>https://azure-dinosaur-903216.hostingersite.com</code>). Used for client invitation links and password reset credentials instead of editing .env.
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Logo URL</Label>
                            <input
                                className={inputClass}
                                placeholder="https://example.com/logo.png"
                                value={systemConfig.logoUrl}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL for the main dashboard logo.</p>
                        </div>
                        <div className="grid gap-2">
                            <Label>Favicon URL</Label>
                            <input
                                className={inputClass}
                                placeholder="/favicon.ico"
                                value={systemConfig.faviconUrl || ""}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, faviconUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL for the browser tab icon.</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between space-x-2 pt-2 border-t border-border/50">
                        <Label htmlFor="enable-registration" className="flex flex-col space-y-1">
                            <span>Enable User Registration</span>
                            <span className="font-normal text-xs text-muted-foreground">Allow new users to sign up for accounts. Turn off to keep the platform private.</span>
                        </Label>
                        <Switch
                            id="enable-registration"
                            checked={systemConfig.enableRegistration}
                            onCheckedChange={c => setSystemConfig(prev => ({ ...prev, enableRegistration: c }))}
                            disabled={!isSuperAdmin}
                        />
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save App Configuration
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Global AI Engine (Zero .env Required) */}
            <Card className="border-primary/20 bg-card">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Global AI Engine (Zero .env Configuration)
                    </CardTitle>
                    <CardDescription>
                        Configure platform-wide AI defaults directly in this web UI. All client WhatsApp bots will automatically inherit these settings if they do not provide their own custom API key.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Default AI Provider</Label>
                            <Select
                                value={systemConfig.aiProvider}
                                onValueChange={(v: string) => {
                                    let defaultModel = systemConfig.aiModel;
                                    if (v === "gemini") {
                                        if (!defaultModel?.toLowerCase().includes("gemini") || defaultModel === "gemini-2.0-flash") {
                                            defaultModel = "gemini-2.5-flash";
                                        }
                                    } else if (v === "openrouter" && !defaultModel?.includes("/")) {
                                        defaultModel = "openai/gpt-4o-mini";
                                    } else if (v === "openai" && defaultModel?.includes("/")) {
                                        defaultModel = "gpt-4o-mini";
                                    }
                                    setSystemConfig(prev => ({
                                        ...prev,
                                        aiProvider: v,
                                        aiModel: defaultModel
                                    }));
                                }}
                                disabled={!isSuperAdmin}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gemini">Google Gemini (Recommended - Free Tier)</SelectItem>
                                    <SelectItem value="openrouter">OpenRouter (Any Model / Multi-Provider)</SelectItem>
                                    <SelectItem value="openai">OpenAI Official</SelectItem>
                                    <SelectItem value="custom">Custom Compatible API</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">
                                {systemConfig.aiProvider === "gemini" 
                                    ? "Google AI Studio offers a free tier (1,500 requests/day). Perfect for WhatsApp bots without charges."
                                    : systemConfig.aiProvider === "openrouter"
                                    ? "OpenRouter routes to GPT-4o, Claude 3.5, Gemini, DeepSeek, and Llama 3."
                                    : "Direct OpenAI API integration."}
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <Label>Default Model</Label>
                                <div className="flex items-center gap-1 flex-wrap">
                                    {systemConfig.aiProvider === "gemini" ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setSystemConfig(p => ({ ...p, aiModel: "gemini-2.5-flash" }))}
                                                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${systemConfig.aiModel === "gemini-2.5-flash" ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80"}`}
                                                disabled={!isSuperAdmin}
                                            >
                                                2.5 Flash
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSystemConfig(p => ({ ...p, aiModel: "gemini-2.5-pro" }))}
                                                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${systemConfig.aiModel === "gemini-2.5-pro" ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80"}`}
                                                disabled={!isSuperAdmin}
                                            >
                                                2.5 Pro
                                            </button>
                                        </>
                                    ) : systemConfig.aiProvider === "openrouter" ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setSystemConfig(p => ({ ...p, aiModel: "openai/gpt-4o-mini" }))}
                                                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${systemConfig.aiModel === "openai/gpt-4o-mini" ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80"}`}
                                                disabled={!isSuperAdmin}
                                            >
                                                GPT-4o Mini
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSystemConfig(p => ({ ...p, aiModel: "google/gemini-2.0-flash-001" }))}
                                                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${systemConfig.aiModel === "google/gemini-2.0-flash-001" ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80"}`}
                                                disabled={!isSuperAdmin}
                                            >
                                                Gemini 2.0
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                            <Input
                                placeholder={
                                    systemConfig.aiProvider === "gemini" 
                                        ? "gemini-2.5-flash" 
                                        : systemConfig.aiProvider === "openrouter" 
                                        ? "openai/gpt-4o-mini" 
                                        : "gpt-4o-mini"
                                }
                                value={systemConfig.aiModel}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, aiModel: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label className="flex items-center justify-between">
                            <span>Global AI API Key</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                                {systemConfig.aiApiKey ? "Saved in Database" : "Not configured"}
                            </span>
                        </Label>
                        <div className="relative">
                            <Input
                                type={showApiKey ? "text" : "password"}
                                placeholder={
                                    systemConfig.aiProvider === "gemini"
                                        ? "AIzaSy... (Paste Google AI Studio Key)"
                                        : systemConfig.aiProvider === "openrouter"
                                        ? "sk-or-v1-..."
                                        : "sk-..."
                                }
                                value={systemConfig.aiApiKey}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const trimmed = val.trim();
                                    setSystemConfig(prev => {
                                        const next = { ...prev, aiApiKey: val };
                                        if (trimmed.startsWith("AIzaSy") && prev.aiProvider !== "gemini") {
                                            next.aiProvider = "gemini";
                                            next.aiModel = "gemini-2.5-flash";
                                        } else if (trimmed.startsWith("sk-or-") && prev.aiProvider !== "openrouter") {
                                            next.aiProvider = "openrouter";
                                            next.aiModel = "openai/gpt-4o-mini";
                                        }
                                        return next;
                                    });
                                }}
                                disabled={!isSuperAdmin}
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
                        {systemConfig.aiProvider === "gemini" ? (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                <span>Get your free Google Gemini API key:</span>
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
                                Keys starting with <code className="bg-muted px-1 rounded">AIzaSy</code> connect to Google Gemini; keys starting with <code className="bg-muted px-1 rounded">sk-or-</code> connect to OpenRouter.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label>Default Fallback System Prompt</Label>
                        <Textarea
                            placeholder="You are a professional WhatsApp business assistant..."
                            className="min-h-[100px]"
                            value={systemConfig.aiSystemPrompt}
                            onChange={(e) => setSystemConfig(prev => ({ ...prev, aiSystemPrompt: e.target.value }))}
                            disabled={!isSuperAdmin}
                        />
                        <p className="text-xs text-muted-foreground">
                            Applied to any bot instance on the platform when the client hasn't written their own custom prompt in Bot Settings.
                        </p>
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Global AI Settings
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* System Updates */}
            <Card>
                <CardHeader>
                    <CardTitle>System Updates</CardTitle>
                    <CardDescription>Check for the latest version from GitHub.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                            setSystemLoading(true);
                            try {
                                const res = await fetch("/api/system/check-updates", { method: "POST" });
                                const data = await res.json();
                                if (data.status) {
                                    toast.success(data.message || "Check complete!");
                                } else {
                                    toast.error(data.message || "Failed to check updates");
                                }
                            } catch (e) {
                                toast.error("Error checking updates");
                            } finally {
                                setSystemLoading(false);
                            }
                        }}
                        disabled={systemLoading}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${systemLoading ? 'animate-spin' : ''}`} />
                        Check for Updates
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
