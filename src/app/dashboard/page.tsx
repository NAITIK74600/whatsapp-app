import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
    Plus,
    Wifi,
    WifiOff,
    MessageSquare,
    Bot,
    Send,
    Settings,
    QrCode,
    ArrowRight,
    Activity,
    Zap,
    Shield,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { getAccessibleSessions } from "@/lib/api-auth";
import { getTenantContext } from "@/lib/tenant-context";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/login");
    }

    const tenantContext = await getTenantContext();
    const activeTenant = tenantContext?.tenant;

    const sessions = await getAccessibleSessions(
        session.user.id!,
        session.user.role || "OWNER",
        tenantContext?.isSuperAdmin ? undefined : activeTenant?.id
    );

    const totalSessions = sessions.length;
    const connectedSessions = sessions.filter(s => s.status === 'CONNECTED').length;
    const disconnectedSessions = totalSessions - connectedSessions; // Anything not connected is disconnected
    const otherSessions = 0;

    // Fetch auto-reply count for accessible sessions
    let autoReplyCount = 0;
    try {
        const sessionIds = sessions.map(s => s.sessionId);
        if (sessionIds.length > 0) {
            autoReplyCount = await prisma.autoReply.count({
                where: { sessionId: { in: sessionIds } }
            });
        }
    } catch {
        // If auto-reply table doesn't exist yet, just show 0
    }

    const stats = [
        {
            title: "WhatsApp Sessions",
            value: `${connectedSessions} / ${activeTenant?.maxSessions || totalSessions}`,
            icon: QrCode,
            description: "Active device connections",
            color: "text-blue-600",
            bg: "bg-blue-50",
        },
        {
            title: "Connected Status",
            value: connectedSessions > 0 ? "Online" : "Offline",
            icon: Wifi,
            description: `${connectedSessions} session(s) active`,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
        },
        {
            title: "Auto-Reply Rules",
            value: autoReplyCount,
            icon: Zap,
            description: "Configured triggers",
            color: "text-amber-600",
            bg: "bg-amber-50",
        },
        {
            title: "Subscription Plan",
            value: activeTenant?.plan || (tenantContext?.isSuperAdmin ? "SUPERADMIN" : "STARTER"),
            icon: Activity,
            description: activeTenant?.businessCategory || (tenantContext?.isSuperAdmin ? "Platform Owner Access" : "Business Workspace"),
            color: "text-primary",
            bg: "bg-primary/10",
        },
    ];

    const quickActions = [
        { href: "/dashboard/sessions", label: "Connect WhatsApp", icon: QrCode, description: "Link phone via QR code" },
        { href: "/dashboard/chat", label: "Live Inbox", icon: MessageSquare, description: "Customer conversations" },
        { href: "/dashboard/knowledge", label: "Knowledge Base", icon: Zap, description: "Train your AI bot" },
        { href: "/dashboard/onboarding", label: "Setup Wizard", icon: Plus, description: "Guided configuration" },
    ];

    return (
        <div className="space-y-8 animate-in fade-in-50 duration-300">
            {/* Super Admin Notice if No Client Tenant is Active */}
            {tenantContext?.isSuperAdmin && !activeTenant && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Shield className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-foreground">Super Admin Platform Mode</p>
                            <p className="text-xs text-muted-foreground">
                                No client workspace is currently selected. You have full platform access to manage clients, system settings, and audit logs.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Link href="/super-admin">
                            <Button size="sm" className="rounded-xl gap-1.5 shadow-sm">
                                <Shield className="h-4 w-4" /> Super Admin Console
                            </Button>
                        </Link>
                        <Link href="/super-admin/clients">
                            <Button size="sm" variant="outline" className="rounded-xl border-border/60">
                                Client Workspaces
                            </Button>
                        </Link>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <div className="flex items-center space-x-2.5">
                        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                            {activeTenant?.name || (tenantContext?.isSuperAdmin ? "Platform Workspace" : "Client Dashboard")}
                        </h2>
                        {activeTenant?.plan ? (
                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                                {activeTenant.plan} PLAN
                            </Badge>
                        ) : tenantContext?.isSuperAdmin ? (
                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                                SUPER ADMIN
                            </Badge>
                        ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        Workspace management and WhatsApp automation overview
                    </p>
                </div>
                <div className="flex items-center space-x-3">
                    <Link href="/dashboard/onboarding">
                        <Button variant="outline" size="sm" className="rounded-xl border-border/60">
                            Setup Wizard
                        </Button>
                    </Link>
                    <Link href="/dashboard/sessions">
                        <Button size="sm" className="rounded-xl shadow-md shadow-primary/20 gap-2">
                            <Plus className="h-4 w-4" /> Add Session
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.title} className="glass-panel border-border/50 shadow-sm hover:shadow-md hover:shadow-primary/5 transition-all duration-300">
                            <CardContent className="p-4 sm:p-5">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{stat.title}</p>
                                        <p className="text-2xl sm:text-3xl font-extrabold text-foreground">{stat.value}</p>
                                        <p className="text-xs text-muted-foreground/70">{stat.description}</p>
                                    </div>
                                    <div className={`${stat.bg} p-2.5 rounded-xl border object-contain border-white/20 dark:border-white/10 shadow-sm`}>
                                        <Icon className={`h-5 w-5 ${stat.color}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Link key={action.href} href={action.href}>
                                <Card className="glass-panel border-border/50 shadow-sm hover:shadow-md hover:shadow-primary/10 hover:-translate-y-0.5 transition-all duration-300 group cursor-pointer h-full">
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="bg-muted/50 p-2.5 rounded-xl group-hover:bg-primary transition-colors border border-border/50 shadow-sm">
                                            <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary-foreground transition-colors" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-foreground truncate">{action.label}</p>
                                            <p className="text-xs text-muted-foreground/80 truncate">{action.description}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Sessions List */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Sessions</h3>
                    <Link href="/dashboard/sessions" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
                        View all <ArrowRight size={14} />
                    </Link>
                </div>

                {sessions.length === 0 ? (
                    <Card className="border-dashed border-2 border-slate-200 shadow-none">
                        <CardContent className="py-12 text-center">
                            <div className="bg-slate-100 h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                <QrCode className="h-6 w-6 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600 mb-1">No sessions yet</p>
                            <p className="text-xs text-slate-400 mb-4">Connect your first WhatsApp device to get started</p>
                            <Link href="/dashboard/sessions">
                                <Button size="sm" variant="outline" className="gap-2">
                                    <Plus className="h-4 w-4" /> Create Session
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {sessions.map(s => {
                            const isConnected = s.status === 'CONNECTED';
                            const isDisconnected = !isConnected;

                            return (
                                <Link key={s.id} href={`/dashboard/sessions/${s.sessionId}`}>
                                    <Card className="glass-panel border-border/50 shadow-sm hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer h-full">
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-foreground truncate">{s.name}</p>
                                                    <p className="text-xs text-muted-foreground font-mono truncate mt-1">{s.sessionId}</p>
                                                </div>
                                                <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0
                                                    ${isConnected ? 'bg-emerald-50 text-emerald-700' : isDisconnected ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}
                                                `}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : isDisconnected ? 'bg-red-400' : 'bg-amber-400'}`} />
                                                    {s.status}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
