"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, Loader2 } from "lucide-react";

interface ForcePasswordChangeModalProps {
  mustChange: boolean;
  userEmail?: string | null;
}

export function ForcePasswordChangeModal({
  mustChange,
  userEmail,
}: ForcePasswordChangeModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(mustChange);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (!mustChange && !open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to update password");
      }

      toast.success("Password successfully established! Welcome to your workspace.");
      setOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Could not set password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md border-amber-500/30 bg-card/95 backdrop-blur-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-2">
            <KeyRound className="w-6 h-6" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Establish Your Permanent Password
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground">
            You signed in with a temporary onboarding password for{" "}
            <span className="font-semibold text-foreground">{userEmail}</span>. For your
            security, please set a new private password before continuing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Temporary / Current Password</Label>
            <Input
              type="password"
              placeholder="Enter the password provided to you"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">New Secure Password</Label>
            <Input
              type="password"
              placeholder="Minimum 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Confirm New Password</Label>
            <Input
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving Password...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" /> Activate Account & Continue
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
