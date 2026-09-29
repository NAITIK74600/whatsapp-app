"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
    Building2, 
    Search, 
    UserPlus, 
    MoreHorizontal, 
    ShieldAlert, 
    KeyRound, 
    Edit2, 
    Trash2, 
    Copy, 
    Check, 
    CheckCircle2, 
    XCircle, 
    QrCode, 
    ExternalLink, 
    AlertCircle, 
    Mail, 
    Phone, 
    Globe, 
    Clock, 
    Sparkles,
    RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ClientRecord {
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "TRIAL";
    plan: "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
    businessCategory?: string;
    country?: string;
    timezone?: string;
    preferredLanguage?: string;
    phone?: string;
    email?: string;
    website?: string;
    description?: string;
    limits: {
        maxSessions: number;
        maxEmployees: number;
        maxMonthlyMessages: number;
        maxContacts: number;
        maxAutoReplies: number;
    };
    owner?: {
        id: string;
        name?: string;
        email: string;
        phone?: string;
    };
    stats: {
        totalSessions: number;
        connectedSessions: number;
        totalTeam: number;
        knowledgeCount: number;
    };
    notes?: string;
    supportContact?: string;
    createdAt: string;
}

export default function SuperAdminClientsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [clients, setClients] = useState<ClientRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");

    // Add Client Modal State
    const [isAddOpen, setIsAddOpen] = useState(searchParams.get("action") === "new");
    const [creating, setCreating] = useState(false);
    const [addForm, setAddForm] = useState({
        businessName: "",
        ownerName: "",
        email: "",
        businessCategory: "Vehicle Dealership",
        country: "Switzerland",
        timezone: "Europe/Zurich",
        preferredLanguage: "de",
        plan: "STARTER",
        status: "ACTIVE",
        phone: "",
        notes: "",
        maxSessions: "1"
    });

    // Provision Success Modal (showing credentials & onboarding text)
    const [provisionSuccess, setProvisionSuccess] = useState<{
        tenantName: string;
        email: string;
        tempPassword?: string;
        loginUrl: string;
        onboardingMessage: string;
    } | null>(null);

    // Edit Client Modal
    const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [updating, setUpdating] = useState(false);

    // Reset Password Modal
    const [resettingClient, setResettingClient] = useState<ClientRecord | null>(null);
    const [resetResult, setResetResult] = useState<{
        tempPassword: string;
        resetMessage: string;
    } | null>(null);
    const [resetting, setResetting] = useState(false);

    // Delete Confirmation Modal
    const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [copied, setCopied] = useState(false);

    const fetchClients = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (searchTerm) query.set("search", searchTerm);
            if (statusFilter !== "ALL") query.set("status", statusFilter);

            const res = await fetch(`/api/super-admin/clients?${query.toString()}`);
            const data = await res.json();
            if (data.success) {
                setClients(data.data || []);
            } else {
                toast.error(data.message || "Failed to load clients");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error loading clients");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
    }, [statusFilter]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchClients();
    };

    // Provisioning
    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch("/api/super-admin/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(addForm)
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Client workspace successfully created!");
                setIsAddOpen(false);
                setProvisionSuccess({
                    tenantName: data.data.tenant.name,
                    email: data.data.owner.email,
                    tempPassword: data.data.credentials?.temporaryPassword,
                    loginUrl: data.data.credentials?.loginUrl || "/auth/login",
                    onboardingMessage: data.data.onboardingMessage
                });
                fetchClients();
            } else {
                toast.error(data.message || "Failed to create client");
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to communicate with server");
        } finally {
            setCreating(false);
        }
    };

    // Toggle Suspend / Reactivate
    const handleToggleStatus = async (client: ClientRecord) => {
        const nextStatus = client.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        try {
            const res = await fetch(`/api/super-admin/clients/${client.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Client ${nextStatus === "ACTIVE" ? "reactivated" : "suspended"}`);
                fetchClients();
            } else {
                toast.error(data.message || "Failed to update status");
            }
        } catch (err: any) {
            toast.error(err.message || "Error updating client status");
        }
    };

    // Update Client
    const handleUpdateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingClient) return;
        setUpdating(true);
        try {
            const res = await fetch(`/api/super-admin/clients/${editingClient.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm)
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Client updated successfully");
                setEditingClient(null);
                fetchClients();
            } else {
                toast.error(data.message || "Failed to update client");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error updating client");
        } finally {
            setUpdating(false);
        }
    };

    // Reset Password
    const handleResetPassword = async () => {
        if (!resettingClient) return;
        setResetting(true);
        try {
            const res = await fetch(`/api/super-admin/clients/${resettingClient.id}/reset-password`, {
                method: "POST"
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Password reset generated!");
                setResetResult({
                    tempPassword: data.data.temporaryPassword,
                    resetMessage: data.data.resetMessage
                });
            } else {
                toast.error(data.message || "Failed to reset password");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error resetting password");
        } finally {
            setResetting(false);
        }
    };

    // Delete Client
    const handleDeleteClient = async () => {
        if (!deletingClient) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/super-admin/clients/${deletingClient.id}`, {
                method: "DELETE"
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Client deleted successfully");
                setDeletingClient(null);
                fetchClients();
            } else {
                toast.error(data.message || "Failed to delete client");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error deleting client");
        } finally {
            setDeleting(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Client Workspaces</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Provision new business accounts, assign subscription plans and manage tenant isolation.
                    </p>
                </div>
                <Button 
                    onClick={() => setIsAddOpen(true)}
                    className="rounded-xl shadow-md shadow-primary/20 shrink-0"
                >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Client Workspace
                </Button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by business name, slug, email, category..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 rounded-xl border-border/60"
                        />
                    </div>
                    <Button type="submit" variant="secondary" className="rounded-xl">
                        Search
                    </Button>
                </form>

                <div className="flex items-center space-x-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px] rounded-xl border-border/60">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="SUSPENDED">Suspended</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={fetchClients} 
                        disabled={loading}
                        className="rounded-xl border-border/60 shrink-0"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {/* Clients Table Card */}
            <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-muted/50 border-b border-border/50 text-muted-foreground">
                            <tr>
                                <th className="px-5 py-3.5 font-semibold">Business Workspace</th>
                                <th className="px-5 py-3.5 font-semibold">Owner & Email</th>
                                <th className="px-5 py-3.5 font-semibold">Plan</th>
                                <th className="px-5 py-3.5 font-semibold">WhatsApp Sessions</th>
                                <th className="px-5 py-3.5 font-semibold">Status</th>
                                <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                                        Loading client records...
                                    </td>
                                </tr>
                            ) : clients.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                                        No client workspaces match your filter criteria.
                                    </td>
                                </tr>
                            ) : (
                                clients.map((client) => {
                                    const isPilot = client.slug === "easy-motors-biel";
                                    return (
                                        <tr key={client.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center space-x-3">
                                                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                                        <Building2 className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-foreground flex items-center space-x-2">
                                                            <span>{client.name}</span>
                                                            {isPilot && (
                                                                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                                                    Pilot Tenant
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            slug: <code className="bg-muted px-1 rounded text-[11px]">{client.slug}</code> • {client.businessCategory || "Business"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-5 py-4">
                                                <div className="font-medium text-foreground">{client.owner?.name || "Not assigned"}</div>
                                                <div className="text-xs text-muted-foreground flex items-center space-x-1">
                                                    <Mail className="h-3 w-3" />
                                                    <span>{client.owner?.email || client.email || "No email"}</span>
                                                </div>
                                            </td>

                                            <td className="px-5 py-4">
                                                <Badge variant="secondary" className="font-semibold text-xs rounded-lg">
                                                    {client.plan}
                                                </Badge>
                                            </td>

                                            <td className="px-5 py-4">
                                                <div className="flex items-center space-x-2">
                                                    <QrCode className="h-4 w-4 text-emerald-500" />
                                                    <span className="font-medium">
                                                        {client.stats.connectedSessions} / {client.limits.maxSessions} Active
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-5 py-4">
                                                {client.status === "ACTIVE" ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                                                        Suspended
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end space-x-1.5">
                                                    {/* Edit */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg"
                                                        title="Edit Workspace"
                                                        onClick={() => {
                                                            setEditingClient(client);
                                                            setEditForm({
                                                                name: client.name,
                                                                plan: client.plan,
                                                                businessCategory: client.businessCategory || "",
                                                                status: client.status,
                                                                maxSessions: client.limits.maxSessions,
                                                                maxMonthlyMessages: client.limits.maxMonthlyMessages,
                                                                phone: client.phone || "",
                                                                notes: client.notes || ""
                                                            });
                                                        }}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>

                                                    {/* Reset Password */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg text-amber-500 hover:text-amber-600"
                                                        title="Reset Owner Password"
                                                        onClick={() => {
                                                            setResettingClient(client);
                                                            setResetResult(null);
                                                        }}
                                                    >
                                                        <KeyRound className="h-4 w-4" />
                                                    </Button>

                                                    {/* Suspend / Reactivate */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className={`h-8 w-8 rounded-lg ${client.status === "ACTIVE" ? "text-destructive hover:text-destructive/80" : "text-emerald-500 hover:text-emerald-600"}`}
                                                        title={client.status === "ACTIVE" ? "Suspend Workspace" : "Reactivate Workspace"}
                                                        onClick={() => handleToggleStatus(client)}
                                                    >
                                                        {client.status === "ACTIVE" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                                    </Button>

                                                    {/* Delete Workspace */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                                                        title="Delete Workspace"
                                                        onClick={() => setDeletingClient(client)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* ADD CLIENT MODAL */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="max-w-xl rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center space-x-2">
                            <Building2 className="h-5 w-5 text-primary" />
                            <span>Add Client Workspace</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Provisions an isolated multi-tenant workspace, owner account, and generates temporary credentials.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreateClient} className="space-y-4 text-xs mt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="businessName" className="font-semibold text-xs">Business Name *</Label>
                                <Input
                                    id="businessName"
                                    required
                                    placeholder="e.g. Zurich Motors AG"
                                    value={addForm.businessName}
                                    onChange={(e) => setAddForm({ ...addForm, businessName: e.target.value })}
                                    className="rounded-xl border-border/60"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="ownerName" className="font-semibold text-xs">Client Owner Name</Label>
                                <Input
                                    id="ownerName"
                                    placeholder="e.g. Marc Dubois"
                                    value={addForm.ownerName}
                                    onChange={(e) => setAddForm({ ...addForm, ownerName: e.target.value })}
                                    className="rounded-xl border-border/60"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="font-semibold text-xs">Owner Email Address *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    placeholder="client@company.ch"
                                    value={addForm.email}
                                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                                    className="rounded-xl border-border/60"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="phone" className="font-semibold text-xs">Contact Phone</Label>
                                <Input
                                    id="phone"
                                    placeholder="+41 79 123 45 67"
                                    value={addForm.phone}
                                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                                    className="rounded-xl border-border/60"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="businessCategory" className="font-semibold text-xs">Industry</Label>
                                <Select 
                                    value={addForm.businessCategory} 
                                    onValueChange={(val) => setAddForm({ ...addForm, businessCategory: val })}
                                >
                                    <SelectTrigger className="rounded-xl border-border/60">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="Vehicle Dealership">Dealership / Garage</SelectItem>
                                        <SelectItem value="E-commerce">E-commerce Store</SelectItem>
                                        <SelectItem value="Restaurant">Restaurant / Cafe</SelectItem>
                                        <SelectItem value="Real Estate">Real Estate Agency</SelectItem>
                                        <SelectItem value="Healthcare">Healthcare Provider</SelectItem>
                                        <SelectItem value="Education">Education / Academy</SelectItem>
                                        <SelectItem value="Local Services">Local Services</SelectItem>
                                        <SelectItem value="Other">Other Business</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="plan" className="font-semibold text-xs">Account Plan</Label>
                                <Select 
                                    value={addForm.plan} 
                                    onValueChange={(val) => setAddForm({ ...addForm, plan: val })}
                                >
                                    <SelectTrigger className="rounded-xl border-border/60">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="STARTER">Starter (1 Session)</SelectItem>
                                        <SelectItem value="PROFESSIONAL">Pro (3 Sessions)</SelectItem>
                                        <SelectItem value="BUSINESS">Business (5 Sessions)</SelectItem>
                                        <SelectItem value="ENTERPRISE">Enterprise (20 Sessions)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="language" className="font-semibold text-xs">Language</Label>
                                <Select 
                                    value={addForm.preferredLanguage} 
                                    onValueChange={(val) => setAddForm({ ...addForm, preferredLanguage: val })}
                                >
                                    <SelectTrigger className="rounded-xl border-border/60">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="de">German (Deutsch)</SelectItem>
                                        <SelectItem value="fr">French (Français)</SelectItem>
                                        <SelectItem value="en">English</SelectItem>
                                        <SelectItem value="it">Italian (Italiano)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="notes" className="font-semibold text-xs">Admin Notes</Label>
                            <Input
                                id="notes"
                                placeholder="Internal notes, contract terms, referral details..."
                                value={addForm.notes}
                                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setIsAddOpen(false)}
                                className="rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={creating}
                                className="rounded-xl shadow-md shadow-primary/20"
                            >
                                {creating ? "Provisioning Workspace..." : "Create Client"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* PROVISION SUCCESS MODAL (WITH ONBOARDING MESSAGE) */}
            <Dialog open={!!provisionSuccess} onOpenChange={() => setProvisionSuccess(null)}>
                <DialogContent className="max-w-xl rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center space-x-2 text-emerald-500">
                            <CheckCircle2 className="h-6 w-6" />
                            <span>Client Workspace Ready!</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Workspace <strong className="text-foreground">{provisionSuccess?.tenantName}</strong> has been provisioned. Copy the onboarding message below and send it to your client.
                        </DialogDescription>
                    </DialogHeader>

                    {provisionSuccess && (
                        <div className="space-y-4 text-xs mt-2">
                            {provisionSuccess.tempPassword && (
                                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-between">
                                    <div>
                                        <span className="font-bold block">Temporary Password Generated:</span>
                                        <code className="text-sm font-mono font-bold tracking-wider">{provisionSuccess.tempPassword}</code>
                                    </div>
                                    <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-[10px]">
                                        Must change on login
                                    </Badge>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Copyable Client Onboarding Message:</Label>
                                <div className="relative">
                                    <pre className="p-3.5 rounded-xl bg-muted/60 border border-border/60 font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                        {provisionSuccess.onboardingMessage}
                                    </pre>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="absolute top-2.5 right-2.5 rounded-lg text-xs"
                                        onClick={() => copyToClipboard(provisionSuccess.onboardingMessage)}
                                    >
                                        {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                                        {copied ? "Copied!" : "Copy Message"}
                                    </Button>
                                </div>
                            </div>

                            <DialogFooter className="pt-2">
                                <Button 
                                    onClick={() => setProvisionSuccess(null)}
                                    className="rounded-xl w-full"
                                >
                                    Done
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* RESET PASSWORD MODAL */}
            <Dialog open={!!resettingClient} onOpenChange={() => { setResettingClient(null); setResetResult(null); }}>
                <DialogContent className="max-w-md rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center space-x-2">
                            <KeyRound className="h-5 w-5 text-amber-500" />
                            <span>Reset Client Password</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Generate a secure temporary password for <strong>{resettingClient?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    {!resetResult ? (
                        <div className="space-y-4 py-2 text-xs">
                            <p className="text-muted-foreground">
                                Are you sure you want to generate a new temporary password for <strong>{resettingClient?.owner?.email}</strong>? They will be required to establish their own private password upon next sign in.
                            </p>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setResettingClient(null)} className="rounded-xl">
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleResetPassword} 
                                    disabled={resetting}
                                    className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                                >
                                    {resetting ? "Generating..." : "Generate New Password"}
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <div className="space-y-4 py-2 text-xs">
                            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                                <span className="font-bold block">New Temporary Password:</span>
                                <code className="text-sm font-mono font-bold tracking-wider">{resetResult.tempPassword}</code>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Updated Setup Instructions:</Label>
                                <pre className="p-3 rounded-xl bg-muted/60 border border-border/60 font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                                    {resetResult.resetMessage}
                                </pre>
                            </div>

                            <DialogFooter>
                                <Button 
                                    variant="outline"
                                    onClick={() => copyToClipboard(resetResult.resetMessage)}
                                    className="rounded-xl"
                                >
                                    Copy Message
                                </Button>
                                <Button 
                                    onClick={() => { setResettingClient(null); setResetResult(null); }}
                                    className="rounded-xl"
                                >
                                    Close
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* EDIT CLIENT MODAL */}
            <Dialog open={!!editingClient} onOpenChange={() => setEditingClient(null)}>
                <DialogContent className="max-w-lg rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center space-x-2">
                            <Edit2 className="h-5 w-5 text-primary" />
                            <span>Edit Workspace Settings</span>
                        </DialogTitle>
                    </DialogHeader>

                    {editingClient && (
                        <form onSubmit={handleUpdateClient} className="space-y-4 text-xs mt-2">
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Business Name</Label>
                                <Input
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="rounded-xl border-border/60"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="font-semibold text-xs">Plan</Label>
                                    <Select 
                                        value={editForm.plan} 
                                        onValueChange={(val) => setEditForm({ ...editForm, plan: val })}
                                    >
                                        <SelectTrigger className="rounded-xl border-border/60">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            <SelectItem value="STARTER">Starter</SelectItem>
                                            <SelectItem value="PROFESSIONAL">Professional</SelectItem>
                                            <SelectItem value="BUSINESS">Business</SelectItem>
                                            <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="font-semibold text-xs">Max WhatsApp Sessions</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={editForm.maxSessions}
                                        onChange={(e) => setEditForm({ ...editForm, maxSessions: e.target.value })}
                                        className="rounded-xl border-border/60"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Internal Notes</Label>
                                <Input
                                    value={editForm.notes}
                                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                    className="rounded-xl border-border/60"
                                />
                            </div>

                            <DialogFooter className="pt-2">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    onClick={() => setEditingClient(null)} 
                                    className="rounded-xl"
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit" 
                                    disabled={updating}
                                    className="rounded-xl shadow-md shadow-primary/20"
                                >
                                    {updating ? "Saving..." : "Save Changes"}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* DELETE MODAL */}
            <Dialog open={!!deletingClient} onOpenChange={() => setDeletingClient(null)}>
                <DialogContent className="max-w-md rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center space-x-2 text-destructive">
                            <ShieldAlert className="h-5 w-5" />
                            <span>Confirm Workspace Deletion</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Are you absolutely sure you want to delete workspace <strong>{deletingClient?.name}</strong>? All associated sessions, contacts, and bot configs will be removed.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="pt-3">
                        <Button variant="outline" onClick={() => setDeletingClient(null)} className="rounded-xl">
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive" 
                            onClick={handleDeleteClient} 
                            disabled={deleting}
                            className="rounded-xl"
                        >
                            {deleting ? "Deleting..." : "Permanently Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
