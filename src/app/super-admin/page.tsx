"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
    Users, 
    Building2, 
    QrCode, 
    MessageSquare, 
    Activity, 
    ShieldCheck, 
    UserPlus, 
    TrendingUp, 
    AlertCircle, 
    CheckCircle2, 
    Clock, 
    Server,
    ExternalLink,
    RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface StatsData {
    clients: {
        total: number;
        active: number;
        suspended: number;
    };
    sessions: {
        total: number;
        connected: number;
        disconnected: number;
    };
    usage: {
        totalMessages: number;
        totalContacts: number;
        totalAutoReplies: number;
    };
    health: {
        status: string;
        uptimeSeconds: number;
        nodeVersion: string;
        heapUsedMB: number;
        heapTotalMB: number;
        activeInstancesInMemory: number;
        dbConnected: boolean;
    };
    recentActivity: Array<{
        id: string;
        action: string;
        resource?: string;
        createdAt: string;
        tenant?: { name: string; slug: string };
        user?: { name: string; email: string };
    }>;
}

export default function SuperAdminOverviewPage() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadStats = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/super-admin/stats");
            const data = await res.json();
            if (data.success && data.data) {
                setStats(data.data);
            } else {
                setError(data.message || "Failed to load platform statistics");
            }
        } catch (err: any) {
            setError(err.message || "Network error loading stats");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, []);

    const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${d > 0 ? `${d}d ` : ""}${h}h ${m}m`;
    };

    return (
        <div className="space-y-8 animate-in fade-in-50 duration-300">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Platform Command Center</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Global SaaS oversight, multi-tenant provisioning and infrastructure health monitoring.
                    </p>
                </div>
                <div className="flex items-center space-x-3">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={loadStats} 
                        disabled={loading}
                        className="rounded-xl border-border/60"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh Data
                    </Button>
                    <Button asChild size="sm" className="rounded-xl shadow-md shadow-primary/20">
                        <Link href="/super-admin/clients?action=new">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Client
                        </Link>
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center space-x-3">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Client Count */}
                <Card className="rounded-2xl border-border/50 shadow-sm hover:border-border transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
                        <Building2 className="h-5 w-5 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold tracking-tight">
                            {loading ? "..." : stats?.clients.total || 0}
                        </div>
                        <div className="flex items-center space-x-2 mt-2">
                            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                {stats?.clients.active || 0} Active
                            </Badge>
                            {stats?.clients.suspended ? (
                                <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                                    {stats.clients.suspended} Suspended
                                </Badge>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                {/* WhatsApp Sessions */}
                <Card className="rounded-2xl border-border/50 shadow-sm hover:border-border transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">WhatsApp Sessions</CardTitle>
                        <QrCode className="h-5 w-5 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold tracking-tight">
                            {loading ? "..." : stats?.sessions.total || 0}
                        </div>
                        <div className="flex items-center space-x-2 mt-2">
                            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                {stats?.sessions.connected || 0} Connected
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                                {stats?.sessions.disconnected || 0} Offline / Standby
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Messages Processed */}
                <Card className="rounded-2xl border-border/50 shadow-sm hover:border-border transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Messages Processed</CardTitle>
                        <MessageSquare className="h-5 w-5 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold tracking-tight">
                            {loading ? "..." : (stats?.usage.totalMessages || 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Across all connected client WhatsApp instances
                        </p>
                    </CardContent>
                </Card>

                {/* Infrastructure Health */}
                <Card className="rounded-2xl border-border/50 shadow-sm hover:border-border transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">System Health</CardTitle>
                        <Activity className="h-5 w-5 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-2">
                            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xl font-bold tracking-tight">
                                {stats?.health.status || "Operational"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Uptime: {stats ? formatUptime(stats.health.uptimeSeconds) : "..."} • RAM: {stats?.health.heapUsedMB || 0} MB
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Recent Audit Activity */}
                <Card className="lg:col-span-2 rounded-2xl border-border/50 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div>
                            <CardTitle className="text-base font-bold">Recent System Activity</CardTitle>
                            <CardDescription className="text-xs">Audit log of tenant onboarding, authentication and security actions</CardDescription>
                        </div>
                        <Button asChild variant="ghost" size="sm" className="text-xs">
                            <Link href="/super-admin/clients">View Clients</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">Loading activity stream...</div>
                        ) : !stats?.recentActivity || stats.recentActivity.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">No recent audit activity recorded yet.</div>
                        ) : (
                            <div className="space-y-3">
                                {stats.recentActivity.map((log) => (
                                    <div 
                                        key={log.id} 
                                        className="flex items-start justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors border border-border/30 text-xs"
                                    >
                                        <div className="flex items-start space-x-3">
                                            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                                                <Clock className="h-3.5 w-3.5" />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-foreground">
                                                    {log.action.replace(/_/g, " ")}
                                                </div>
                                                <div className="text-muted-foreground mt-0.5">
                                                    {log.tenant ? `Client: ${log.tenant.name}` : "Platform Action"} • {log.user?.email || "System"}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-[11px] text-muted-foreground shrink-0 ml-3">
                                            {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Right Col: Hostinger & Multi-Tenant Status */}
                <div className="space-y-4">
                    <Card className="rounded-2xl border-border/50 shadow-sm bg-gradient-to-br from-card to-card/60">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-bold flex items-center space-x-2">
                                <Server className="h-4 w-4 text-primary" />
                                <span>Multi-Tenant Architecture</span>
                            </CardTitle>
                            <CardDescription className="text-xs">Production Hostinger Deployment</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                                <span className="text-muted-foreground">Database Engine</span>
                                <span className="font-medium">MySQL (Hostinger Cloud)</span>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                                <span className="text-muted-foreground">Session Isolation</span>
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                                    Strict Backend Scope
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                                <span className="text-muted-foreground">Pilot Tenant</span>
                                <span className="font-medium text-primary">Easy Motors Biel</span>
                            </div>
                            <div className="flex items-center justify-between py-1.5">
                                <span className="text-muted-foreground">Node Environment</span>
                                <span className="font-medium">{stats?.health.nodeVersion || "Node.js v20+"}</span>
                            </div>

                            <div className="pt-2">
                                <Button asChild variant="outline" className="w-full text-xs rounded-xl border-border/60">
                                    <Link href="/super-admin/clients">
                                        <Building2 className="h-3.5 w-3.5 mr-2" />
                                        Manage All Workspaces
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Access Card */}
                    <Card className="rounded-2xl border-primary/20 bg-primary/[0.03] shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center space-x-2">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                <span>Security & Onboarding</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground space-y-2.5">
                            <p>
                                When creating a client, a secure temporary password and isolated workspace are generated automatically.
                            </p>
                            <p>
                                Clients can connect their WhatsApp by scanning the QR code inside their private portal at <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-[11px]">/dashboard/sessions</code>.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
