"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
    CalendarClock, 
    Plus, 
    User, 
    Phone, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    MessageSquare, 
    Trash2, 
    Filter,
    RefreshCw 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";

interface AppointmentItem {
    id: string;
    customerName: string;
    customerPhone: string;
    serviceName: string;
    scheduledAt: string;
    status: "REQUESTED" | "CONFIRMED" | "RESCHEDULED" | "CANCELLED" | "COMPLETED";
    notes?: string;
    createdAt: string;
}

export default function AppointmentsPage() {
    const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("ALL");

    // Add modal
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [addForm, setAddForm] = useState({
        customerName: "",
        customerPhone: "",
        serviceName: "Test Drive / Consultation",
        scheduledAt: "",
        notes: "",
        status: "REQUESTED"
    });

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filterStatus !== "ALL") query.set("status", filterStatus);

            const res = await fetch(`/api/appointments?${query.toString()}`);
            const data = await res.json();
            if (data.success) {
                setAppointments(data.data || []);
            } else {
                toast.error(data.message || "Failed to load appointments");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error loading appointments");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAppointments();
    }, [filterStatus]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch("/api/appointments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(addForm)
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Appointment booked successfully!");
                setIsAddOpen(false);
                fetchAppointments();
            } else {
                toast.error(data.message || "Failed to create appointment");
            }
        } catch (err: any) {
            toast.error(err.message || "Error booking appointment");
        } finally {
            setCreating(false);
        }
    };

    const handleStatusUpdate = async (id: string, nextStatus: string) => {
        try {
            const res = await fetch(`/api/appointments/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Appointment marked as ${nextStatus.toLowerCase()}`);
                fetchAppointments();
            } else {
                toast.error(data.message || "Failed to update appointment");
            }
        } catch (err: any) {
            toast.error(err.message || "Error updating appointment");
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        try {
            const res = await fetch(`/api/appointments/${deletingId}`, {
                method: "DELETE"
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Appointment deleted");
                setDeletingId(null);
                fetchAppointments();
            } else {
                toast.error(data.message || "Failed to delete");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error deleting");
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "CONFIRMED":
                return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">Confirmed</Badge>;
            case "COMPLETED":
                return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">Completed</Badge>;
            case "CANCELLED":
                return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Cancelled</Badge>;
            default:
                return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">Requested</Badge>;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Appointments & Bookings</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage customer visits, test drives, service bookings and consultation schedules.
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={fetchAppointments} 
                        disabled={loading}
                        className="rounded-xl border-border/60 shrink-0"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button 
                        onClick={() => setIsAddOpen(true)}
                        className="rounded-xl shadow-md shadow-primary/20 shrink-0"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Book Appointment
                    </Button>
                </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/40 w-fit">
                {["ALL", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"].map((status) => (
                    <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            filterStatus === status 
                                ? "bg-background text-foreground shadow-sm" 
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {status}
                    </button>
                ))}
            </div>

            {/* List */}
            {loading ? (
                <div className="py-20 text-center text-sm text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading appointment schedule...
                </div>
            ) : appointments.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-border/70 p-12 text-center space-y-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                        <CalendarClock className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-base">No appointments found</h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        Customer appointment requests from WhatsApp conversations will appear here.
                    </p>
                    <Button onClick={() => setIsAddOpen(true)} size="sm" className="rounded-xl">
                        <Plus className="h-4 w-4 mr-2" />
                        Schedule Appointment
                    </Button>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {appointments.map((item) => (
                        <Card key={item.id} className="rounded-2xl border-border/50 shadow-sm hover:border-border transition-all flex flex-col justify-between">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center space-x-2">
                                            <span className="font-bold text-base text-foreground">{item.customerName}</span>
                                            {getStatusBadge(item.status)}
                                        </div>
                                        <div className="text-xs text-muted-foreground flex items-center space-x-3">
                                            <span className="flex items-center">
                                                <Phone className="h-3 w-3 mr-1 text-primary" />
                                                {item.customerPhone}
                                            </span>
                                            <span className="font-medium text-foreground">
                                                {item.serviceName}
                                            </span>
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                                        onClick={() => setDeletingId(item.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </CardHeader>

                            <CardContent className="text-xs space-y-3 pt-0">
                                <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-muted/40 border border-border/40 font-semibold text-foreground">
                                    <Clock className="h-4 w-4 text-primary shrink-0" />
                                    <span>{new Date(item.scheduledAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</span>
                                </div>

                                {item.notes && (
                                    <p className="text-muted-foreground bg-muted/20 p-2.5 rounded-xl border border-border/30">
                                        {item.notes}
                                    </p>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                                    <Button asChild variant="outline" size="sm" className="rounded-xl text-xs h-8">
                                        <Link href={`/dashboard/chat?phone=${encodeURIComponent(item.customerPhone)}`}>
                                            <MessageSquare className="h-3.5 w-3.5 mr-1 text-primary" />
                                            WhatsApp Chat
                                        </Link>
                                    </Button>

                                    <div className="flex items-center space-x-1.5">
                                        {item.status !== "CONFIRMED" && item.status !== "COMPLETED" && (
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="rounded-xl text-xs h-8 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                                                onClick={() => handleStatusUpdate(item.id, "CONFIRMED")}
                                            >
                                                Confirm
                                            </Button>
                                        )}
                                        {item.status === "CONFIRMED" && (
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="rounded-xl text-xs h-8 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                                                onClick={() => handleStatusUpdate(item.id, "COMPLETED")}
                                            >
                                                Complete
                                            </Button>
                                        )}
                                        {item.status !== "CANCELLED" && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="rounded-xl text-xs h-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleStatusUpdate(item.id, "CANCELLED")}
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* ADD APPOINTMENT MODAL */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="max-w-md rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center space-x-2">
                            <CalendarClock className="h-5 w-5 text-primary" />
                            <span>Schedule Appointment</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Record a booking or consultation requested by a customer.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreate} className="space-y-4 text-xs mt-2">
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-xs">Customer Full Name *</Label>
                            <Input
                                required
                                placeholder="e.g. Thomas Keller"
                                value={addForm.customerName}
                                onChange={(e) => setAddForm({ ...addForm, customerName: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-xs">Customer Phone (WhatsApp) *</Label>
                            <Input
                                required
                                placeholder="+41 79 123 45 67"
                                value={addForm.customerPhone}
                                onChange={(e) => setAddForm({ ...addForm, customerPhone: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-xs">Service / Reason *</Label>
                            <Input
                                required
                                placeholder="e.g. Test Drive Audi A4 or Annual Inspection"
                                value={addForm.serviceName}
                                onChange={(e) => setAddForm({ ...addForm, serviceName: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-xs">Scheduled Date & Time *</Label>
                            <Input
                                required
                                type="datetime-local"
                                value={addForm.scheduledAt}
                                onChange={(e) => setAddForm({ ...addForm, scheduledAt: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-xs">Notes / Special Instructions</Label>
                            <Textarea
                                rows={3}
                                placeholder="Any specific vehicle, preferences or requests..."
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
                                {creating ? "Booking..." : "Confirm Booking"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* DELETE MODAL */}
            <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
                <DialogContent className="max-w-md rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-destructive">
                            Delete Appointment
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Are you sure you want to remove this appointment record?
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="pt-3">
                        <Button variant="outline" onClick={() => setDeletingId(null)} className="rounded-xl">
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive" 
                            onClick={handleDelete}
                            className="rounded-xl"
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
