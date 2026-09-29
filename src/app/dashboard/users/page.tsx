"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users as UsersIcon,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Eye,
  KeyRound,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeamMember {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
  mustChangePassword: boolean;
  joinedAt: string;
}

interface TeamData {
  members: TeamMember[];
  limits: {
    currentEmployees: number;
    maxEmployees: number;
    plan: string;
  };
  callerRole: string;
  isSuperAdmin: boolean;
}

export default function TeamManagementPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MANAGER" | "AGENT" | "VIEWER">("AGENT");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviting, setInviting] = useState(false);

  // Onboarding Message Output State
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit / Reset Password State
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [resetPassword, setResetPassword] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team");
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      } else {
        toast.error("Failed to load team members");
      }
    } catch (e) {
      toast.error("Network error loading team members");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setInvitePassword(pwd);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName || !inviteEmail || !invitePassword) {
      toast.error("Please fill in all required fields");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          password: invitePassword,
          role: inviteRole,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.message || resJson.error || "Failed to invite member");
      }

      toast.success(resJson.message);

      // Generate copyable onboarding message
      const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "https://azure-dinosaur-903216.hostingersite.com/login";
      const message = `👋 Hello ${inviteName},\n\nYou have been invited to join the WhatsApp Automation platform.\n\n🌐 Login URL: ${loginUrl}\n📧 Email: ${inviteEmail}\n🔑 Temporary Password: ${invitePassword}\n\n⚠️ Security Notice: You will be asked to create your own permanent password immediately upon your first login.\n\nBest regards,\nWorkspace Team`;
      setOnboardingMessage(message);

      // Reset form & reload
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      fetchTeam();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    setUpdating(true);
    try {
      const payload: any = { role: editRole };
      if (resetPassword) {
        payload.temporaryPassword = resetPassword;
      }

      const res = await fetch(`/api/team/${editingMember.membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.message || "Failed to update member");
      }

      toast.success(resJson.message);
      setEditingMember(null);
      setResetPassword("");
      fetchTeam();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveMember = async (membershipId: string, memberEmail: string) => {
    if (!confirm(`Are you sure you want to remove ${memberEmail} from this workspace?`)) return;

    try {
      const res = await fetch(`/api/team/${membershipId}`, { method: "DELETE" });
      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.message || "Failed to remove member");
      }

      toast.success(resJson.message);
      fetchTeam();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Onboarding invitation copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return (
          <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 flex items-center gap-1 font-semibold">
            <ShieldAlert className="w-3 h-3" /> Owner
          </Badge>
        );
      case "ADMIN":
        return (
          <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 flex items-center gap-1 font-semibold">
            <ShieldCheck className="w-3 h-3" /> Administrator
          </Badge>
        );
      case "MANAGER":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 flex items-center gap-1 font-semibold">
            <UserCheck className="w-3 h-3" /> Manager
          </Badge>
        );
      case "AGENT":
        return (
          <Badge className="bg-purple-500/15 text-purple-500 border-purple-500/30 flex items-center gap-1 font-semibold">
            <UsersIcon className="w-3 h-3" /> Agent
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <Eye className="w-3 h-3" /> Viewer
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading workspace team members...</p>
      </div>
    );
  }

  const limits = data?.limits;
  const members = data?.members || [];
  const isLimitReached = limits ? limits.currentEmployees >= limits.maxEmployees : false;
  const canManage = data?.isSuperAdmin || data?.callerRole === "OWNER" || data?.callerRole === "ADMIN";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-primary" /> Team Members & Roles
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage employee access, granular roles, and workspace permissions.
          </p>
        </div>

        {canManage && (
          <Button
            onClick={() => {
              handleGeneratePassword();
              setOnboardingMessage(null);
              setInviteModalOpen(true);
            }}
            disabled={isLimitReached}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Invite Employee
          </Button>
        )}
      </div>

      {/* Usage & Plan Limits Card */}
      {limits && (
        <Card className="bg-card/50 border-border/60">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  Team Usage: {limits.currentEmployees} of {limits.maxEmployees} Seats Active
                </span>
                <p className="text-xs text-muted-foreground">
                  Workspace Plan: <span className="font-bold text-primary">{limits.plan}</span>
                </p>
              </div>
            </div>

            {isLimitReached && (
              <Badge variant="destructive" className="flex items-center gap-1 self-start sm:self-center">
                <AlertCircle className="w-3.5 h-3.5" /> Plan Seat Limit Reached
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => (
          <Card key={member.membershipId} className="border-border/60 hover:border-primary/40 transition-colors">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary">
                      {member.name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm leading-none">{member.name || "Unnamed"}</h3>
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-[180px]">{member.email}</p>
                    </div>
                  </div>
                  {getRoleBadge(member.role)}
                </div>

                <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground flex justify-between items-center">
                  <span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
                  {member.mustChangePassword ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] py-0">
                      Temp Password
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 text-[10px] py-0">
                      Active
                    </Badge>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="pt-3 border-t border-border/40 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs hover:bg-muted"
                    onClick={() => {
                      setEditingMember(member);
                      setEditRole(member.role);
                      setResetPassword("");
                    }}
                  >
                    Edit / Role
                  </Button>
                  {member.role !== "OWNER" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveMember(member.membershipId, member.email)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="sm:max-w-lg border-border/80 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Invite Team Member
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add a new employee to this workspace and assign their operational role.
            </DialogDescription>
          </DialogHeader>

          {!onboardingMessage ? (
            <form onSubmit={handleInvite} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Name</Label>
                  <Input
                    placeholder="e.g. Sarah Jenkins"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email Address</Label>
                  <Input
                    type="email"
                    placeholder="employee@business.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Assign Role & Permissions</Label>
                <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">
                      🛡️ Administrator (Full workspace & automation config)
                    </SelectItem>
                    <SelectItem value="MANAGER">
                      💼 Manager (Manage assigned chats, leads & reports)
                    </SelectItem>
                    <SelectItem value="AGENT">
                      💬 Agent (Customer chat replies & internal notes)
                    </SelectItem>
                    <SelectItem value="VIEWER">
                      👁️ Viewer (Read-only access to customer analytics)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Initial Temporary Password</Label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Regenerate
                  </button>
                </div>
                <Input
                  type="text"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  The user will be prompted to replace this with their own password on first login.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setInviteModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={inviting} className="bg-primary hover:bg-primary/90">
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Invitation"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-500 flex items-center gap-2">
                <Check className="w-4 h-4" /> Employee invited successfully! Send them the invitation below:
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Ready-to-Send Onboarding Message</Label>
                <textarea
                  readOnly
                  rows={8}
                  value={onboardingMessage}
                  className="w-full text-xs font-mono p-3 rounded-lg bg-muted/60 border border-border resize-none focus:outline-none"
                />
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyToClipboard(onboardingMessage)}
                  className="flex items-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy Invitation"}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setOnboardingMessage(null);
                    setInviteModalOpen(false);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Role / Reset Password Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="sm:max-w-md border-border/80 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Edit Member Permissions</DialogTitle>
            <DialogDescription className="text-xs">
              Update role or set a temporary password for {editingMember?.email}.
            </DialogDescription>
          </DialogHeader>

          {editingMember && (
            <form onSubmit={handleUpdateMember} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">Owner (Full Workspace Control)</SelectItem>
                    <SelectItem value="ADMIN">Administrator</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="AGENT">Agent</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reset Temporary Password (Optional)</Label>
                <Input
                  type="password"
                  placeholder="Leave blank to keep existing password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  If set, forces the user to establish a new password upon their next login.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditingMember(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updating}>
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
