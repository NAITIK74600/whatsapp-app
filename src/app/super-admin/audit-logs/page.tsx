"use client";

import { useEffect, useState } from "react";
import { Clock, Shield, RefreshCw, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function SuperAdminAuditLogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/super-admin/audit-logs");
            const data = await res.json();
            if (data.success) {
                setLogs(data.data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Security & Audit Logs</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Cryptographically traceable record of all platform authentication, tenant provisioning and administrative actions.
                    </p>
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchLogs} 
                    disabled={loading}
                    className="rounded-xl border-border/60"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                    Refresh Logs
                </Button>
            </div>

            <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-muted/50 border-b border-border/50 text-muted-foreground">
                            <tr>
                                <th className="px-5 py-3.5 font-semibold">Event / Action</th>
                                <th className="px-5 py-3.5 font-semibold">Tenant / Workspace</th>
                                <th className="px-5 py-3.5 font-semibold">Actor</th>
                                <th className="px-5 py-3.5 font-semibold">IP Address</th>
                                <th className="px-5 py-3.5 font-semibold">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                                        Loading audit stream...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                                        No audit records found.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-muted/30 transition-colors text-xs">
                                        <td className="px-5 py-3.5">
                                            <div className="font-semibold text-foreground">
                                                {log.action}
                                            </div>
                                            {log.resource && (
                                                <div className="text-[11px] text-muted-foreground font-mono">
                                                    {log.resource}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 font-medium">
                                            {log.tenant ? log.tenant.name : <span className="text-muted-foreground">Global Platform</span>}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {log.user?.email || "System Engine"}
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-[11px] text-muted-foreground">
                                            {log.ipAddress || "—"}
                                        </td>
                                        <td className="px-5 py-3.5 text-muted-foreground">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
