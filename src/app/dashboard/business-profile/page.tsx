"use client";

import { useEffect, useState } from "react";
import { 
    Building2, 
    Save, 
    Clock, 
    Mail, 
    Phone, 
    Globe, 
    MapPin, 
    Sparkles, 
    CheckCircle2, 
    RefreshCw 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function BusinessProfilePage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: "",
        businessCategory: "Vehicle Dealership",
        description: "",
        address: "",
        country: "Switzerland",
        timezone: "Europe/Zurich",
        preferredLanguage: "de",
        phone: "",
        email: "",
        website: "",
        supportContact: "",
        businessHours: {
            monday: "08:00 - 18:30",
            tuesday: "08:00 - 18:30",
            wednesday: "08:00 - 18:30",
            thursday: "08:00 - 18:30",
            friday: "08:00 - 18:30",
            saturday: "09:00 - 16:00",
            sunday: "Closed"
        }
    });

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/business-profile");
            const data = await res.json();
            if (data.success && data.data) {
                const b = data.data;
                setForm({
                    name: b.name || "",
                    businessCategory: b.businessCategory || "Vehicle Dealership",
                    description: b.description || "",
                    address: b.address || "",
                    country: b.country || "Switzerland",
                    timezone: b.timezone || "Europe/Zurich",
                    preferredLanguage: b.preferredLanguage || "de",
                    phone: b.phone || "",
                    email: b.email || "",
                    website: b.website || "",
                    supportContact: b.supportContact || "",
                    businessHours: b.businessHours || {
                        monday: "08:00 - 18:30",
                        tuesday: "08:00 - 18:30",
                        wednesday: "08:00 - 18:30",
                        thursday: "08:00 - 18:30",
                        friday: "08:00 - 18:30",
                        saturday: "09:00 - 16:00",
                        sunday: "Closed"
                    }
                });
            }
        } catch (err: any) {
            toast.error("Failed to load business profile");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch("/api/business-profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Business profile saved successfully!");
            } else {
                toast.error(data.message || "Failed to update profile");
            }
        } catch (err: any) {
            toast.error(err.message || "Error saving profile");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="py-20 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                Loading your business profile...
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6 max-w-4xl mx-auto animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Business Profile</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Configure your company identity, opening hours and contact information used by your AI bot.
                    </p>
                </div>
                <Button 
                    type="submit" 
                    disabled={saving}
                    className="rounded-xl shadow-md shadow-primary/20 shrink-0"
                >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save Profile"}
                </Button>
            </div>

            {/* General Business Information */}
            <Card className="rounded-2xl border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center space-x-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span>Company Identity</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Basic details that distinguish your business workspace.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="name" className="font-semibold text-xs">Business / Company Name *</Label>
                            <Input
                                id="name"
                                required
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="businessCategory" className="font-semibold text-xs">Industry</Label>
                            <Select 
                                value={form.businessCategory} 
                                onValueChange={(val) => setForm({ ...form, businessCategory: val })}
                            >
                                <SelectTrigger className="rounded-xl border-border/60">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    <SelectItem value="Vehicle Dealership">Dealership / Garage</SelectItem>
                                    <SelectItem value="E-commerce">E-commerce / Retail</SelectItem>
                                    <SelectItem value="Restaurant">Restaurant / Cafe</SelectItem>
                                    <SelectItem value="Real Estate">Real Estate Agency</SelectItem>
                                    <SelectItem value="Healthcare">Healthcare Clinic</SelectItem>
                                    <SelectItem value="Education">Education & Courses</SelectItem>
                                    <SelectItem value="Local Services">Local Services</SelectItem>
                                    <SelectItem value="Other">Other Business</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="description" className="font-semibold text-xs">Business Description / Tagline</Label>
                        <Textarea
                            id="description"
                            rows={3}
                            placeholder="e.g. Official dealership for quality vehicles, full garage service and MFK in Biel/Bienne."
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            className="rounded-xl border-border/60"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Contact & Location */}
            <Card className="rounded-2xl border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center space-x-2">
                        <MapPin className="h-4 w-4 text-emerald-500" />
                        <span>Location & Contact Details</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Customers inquiring on WhatsApp will receive these details when asking for location or phone.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="phone" className="font-semibold text-xs">Official Phone</Label>
                            <Input
                                id="phone"
                                placeholder="+41 32 322 00 00"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="font-semibold text-xs">Contact Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="info@company.ch"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="website" className="font-semibold text-xs">Website URL</Label>
                            <Input
                                id="website"
                                placeholder="https://easymotors.ch"
                                value={form.website}
                                onChange={(e) => setForm({ ...form, website: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-2 space-y-1.5">
                            <Label htmlFor="address" className="font-semibold text-xs">Physical Address</Label>
                            <Input
                                id="address"
                                placeholder="Street, Number, Postal Code, City"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="country" className="font-semibold text-xs">Country</Label>
                            <Input
                                id="country"
                                value={form.country}
                                onChange={(e) => setForm({ ...form, country: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Opening Hours */}
            <Card className="rounded-2xl border-border/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-blue-500" />
                        <span>Opening / Business Hours</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Used by your AI bot and auto-reply rules to answer customer inquiries regarding availability.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => {
                            const dayCap = day.charAt(0).toUpperCase() + day.slice(1);
                            const val = (form.businessHours as any)[day] || "";
                            return (
                                <div key={day} className="flex items-center space-x-3 p-2.5 rounded-xl bg-muted/40 border border-border/40">
                                    <span className="w-24 font-semibold capitalize text-foreground">{dayCap}</span>
                                    <Input
                                        value={val}
                                        placeholder="e.g. 08:00 - 18:00 or Closed"
                                        onChange={(e) => {
                                            setForm({
                                                ...form,
                                                businessHours: {
                                                    ...form.businessHours,
                                                    [day]: e.target.value
                                                }
                                            });
                                        }}
                                        className="h-8 text-xs rounded-lg border-border/60"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </form>
    );
}
