"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
    CheckCircle2, 
    Circle, 
    ArrowRight, 
    ArrowLeft, 
    Building2, 
    QrCode, 
    Bot, 
    BookOpen, 
    Sparkles, 
    Zap, 
    Check, 
    RefreshCw,
    ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface OnboardingData {
    tenantName: string;
    hasSession: boolean;
    sessionConnected: boolean;
    hasKnowledge: boolean;
    aiConfigured: boolean;
}

export default function OnboardingWizardPage() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<OnboardingData>({
        tenantName: "",
        hasSession: false,
        sessionConnected: false,
        hasKnowledge: false,
        aiConfigured: false
    });

    const checkStatus = async () => {
        setLoading(true);
        try {
            const [profileRes, sessionsRes, kbRes] = await Promise.all([
                fetch("/api/business-profile"),
                fetch("/api/sessions"),
                fetch("/api/knowledge")
            ]);

            const profile = await profileRes.json();
            const sessions = await sessionsRes.json();
            const kb = await kbRes.json();

            const sessList = sessions.data || [];
            const connected = sessList.some((s: any) => s.status === "CONNECTED");
            const hasSess = sessList.length > 0;
            const hasKb = (kb.data || []).length > 0;

            setData({
                tenantName: profile.data?.name || "Your Workspace",
                hasSession: hasSess,
                sessionConnected: connected,
                hasKnowledge: hasKb,
                aiConfigured: true
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkStatus();
    }, []);

    const steps = [
        {
            num: 1,
            title: "Business Profile",
            desc: "Company info, opening hours, contact data",
            icon: Building2,
            href: "/dashboard/business-profile",
            done: true
        },
        {
            num: 2,
            title: "Connect WhatsApp",
            desc: "Scan QR code to bind your WhatsApp business account",
            icon: QrCode,
            href: "/dashboard/sessions",
            done: data.sessionConnected
        },
        {
            num: 3,
            title: "Bot Persona & AI",
            desc: "Configure personality, prompt instructions and model",
            icon: Bot,
            href: "/dashboard/bot-settings",
            done: data.aiConfigured
        },
        {
            num: 4,
            title: "Knowledge Base",
            desc: "Add your FAQs, services, warranty policies and prices",
            icon: BookOpen,
            href: "/dashboard/knowledge",
            done: data.hasKnowledge
        },
        {
            num: 5,
            title: "Test & Launch",
            desc: "Simulate customer messages and go live with confidence",
            icon: Sparkles,
            href: "/dashboard/chat",
            done: data.sessionConnected
        }
    ];

    const completedCount = steps.filter(s => s.done).length;
    const progressPercent = Math.round((completedCount / steps.length) * 100);

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="text-center space-y-2">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Workspace Setup Wizard</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight">
                    Welcome to {data.tenantName}
                </h1>
                <p className="text-muted-foreground text-sm max-w-lg mx-auto">
                    Follow these guided steps to link your WhatsApp number, customize your bot rules, and start automating customer conversations.
                </p>
            </div>

            {/* Progress Bar */}
            <Card className="rounded-2xl border-border/50 p-6 shadow-sm">
                <div className="flex items-center justify-between text-xs font-semibold mb-2.5">
                    <span className="text-foreground">Setup Completion</span>
                    <span className="text-primary">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-2.5 rounded-full" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
                    <span>{completedCount} of {steps.length} steps completed</span>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={checkStatus} 
                        className="h-6 text-[11px] px-2"
                        disabled={loading}
                    >
                        <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                        Verify Progress
                    </Button>
                </div>
            </Card>

            {/* Steps List */}
            <div className="space-y-3">
                {steps.map((st) => {
                    const Icon = st.icon;
                    return (
                        <div 
                            key={st.num}
                            className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                                st.done 
                                    ? "bg-muted/20 border-emerald-500/20" 
                                    : "bg-card border-border/50 hover:border-border"
                            }`}
                        >
                            <div className="flex items-center space-x-3.5">
                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    st.done 
                                        ? "bg-emerald-500/10 text-emerald-500" 
                                        : "bg-primary/10 text-primary"
                                }`}>
                                    {st.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                                </div>
                                <div>
                                    <div className="flex items-center space-x-2">
                                        <span className="font-bold text-sm text-foreground">
                                            Step {st.num}: {st.title}
                                        </span>
                                        {st.done && (
                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                                                Ready
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {st.desc}
                                    </p>
                                </div>
                            </div>

                            <Button asChild size="sm" variant={st.done ? "outline" : "default"} className="rounded-xl shrink-0 text-xs">
                                <Link href={st.href}>
                                    <span>{st.done ? "Review" : "Configure"}</span>
                                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                                </Link>
                            </Button>
                        </div>
                    );
                })}
            </div>

            {/* Launch Banner */}
            <Card className="rounded-2xl border-primary/20 bg-primary/[0.04] p-6 text-center space-y-3">
                <h3 className="font-bold text-base text-foreground">Ready to start chatting?</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Once your WhatsApp session shows "CONNECTED", incoming customer messages will be processed according to your auto-reply rules and AI knowledge base.
                </p>
                <div className="pt-2 flex justify-center gap-3">
                    <Button asChild className="rounded-xl shadow-md shadow-primary/20">
                        <Link href="/dashboard/sessions">
                            <QrCode className="h-4 w-4 mr-2" />
                            Open WhatsApp Sessions
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-xl">
                        <Link href="/dashboard">
                            Go to Dashboard
                        </Link>
                    </Button>
                </div>
            </Card>
        </div>
    );
}
