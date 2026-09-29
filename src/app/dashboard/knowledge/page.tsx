"use client";

import { useEffect, useState } from "react";
import { 
    BookOpen, 
    Plus, 
    Search, 
    Edit2, 
    Trash2, 
    CheckCircle2, 
    AlertCircle, 
    HelpCircle, 
    Package, 
    Wrench, 
    FileText, 
    Check, 
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

interface KnowledgeItem {
    id: string;
    category: string;
    title: string;
    content: string;
    isVerified: boolean;
    sourceUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export default function KnowledgeBasePage() {
    const [entries, setEntries] = useState<KnowledgeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState("ALL");
    const [search, setSearch] = useState("");

    // Add / Edit Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        category: "FAQ",
        title: "",
        content: "",
        sourceUrl: "",
        isVerified: true
    });

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (activeCategory !== "ALL") query.set("category", activeCategory);
            if (search) query.set("search", search);

            const res = await fetch(`/api/knowledge?${query.toString()}`);
            const data = await res.json();
            if (data.success) {
                setEntries(data.data || []);
            } else {
                toast.error(data.message || "Failed to load knowledge entries");
            }
        } catch (err: any) {
            toast.error(err.message || "Network error loading knowledge");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, [activeCategory]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchEntries();
    };

    const handleOpenAdd = () => {
        setEditingItem(null);
        setForm({
            category: activeCategory !== "ALL" ? activeCategory : "FAQ",
            title: "",
            content: "",
            sourceUrl: "",
            isVerified: true
        });
        setModalOpen(true);
    };

    const handleOpenEdit = (item: KnowledgeItem) => {
        setEditingItem(item);
        setForm({
            category: item.category,
            title: item.title,
            content: item.content,
            sourceUrl: item.sourceUrl || "",
            isVerified: item.isVerified
        });
        setModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const url = editingItem ? `/api/knowledge/${editingItem.id}` : "/api/knowledge";
            const method = editingItem ? "PATCH" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (data.success) {
                toast.success(editingItem ? "Entry updated" : "Knowledge entry added");
                setModalOpen(false);
                fetchEntries();
            } else {
                toast.error(data.message || "Failed to save entry");
            }
        } catch (err: any) {
            toast.error(err.message || "Error saving entry");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/knowledge/${deletingId}`, {
                method: "DELETE"
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Entry removed");
                setDeletingId(null);
                fetchEntries();
            } else {
                toast.error(data.message || "Failed to delete entry");
            }
        } catch (err: any) {
            toast.error(err.message || "Error deleting entry");
        } finally {
            setDeleting(false);
        }
    };

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case "FAQ": return <HelpCircle className="h-4 w-4 text-primary" />;
            case "PRODUCT": return <Package className="h-4 w-4 text-emerald-500" />;
            case "SERVICE": return <Wrench className="h-4 w-4 text-blue-500" />;
            default: return <FileText className="h-4 w-4 text-muted-foreground" />;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Knowledge Base</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Train your AI bot with business facts, FAQs, product catalogs, pricing and policy guidelines.
                    </p>
                </div>
                <Button 
                    onClick={handleOpenAdd}
                    className="rounded-xl shadow-md shadow-primary/20 shrink-0"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Knowledge Entry
                </Button>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/40 w-full md:w-auto">
                    {["ALL", "FAQ", "SERVICE", "PRODUCT", "POLICY", "INSTRUCTION"].map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                activeCategory === cat 
                                    ? "bg-background text-foreground shadow-sm" 
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-80">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search knowledge..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 rounded-xl border-border/60 text-xs"
                        />
                    </div>
                    <Button type="submit" variant="secondary" className="rounded-xl text-xs">
                        Search
                    </Button>
                </form>
            </div>

            {/* Entries Grid */}
            {loading ? (
                <div className="py-20 text-center text-sm text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading knowledge items...
                </div>
            ) : entries.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-border/70 p-12 text-center space-y-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                        <BookOpen className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-base">No knowledge entries found</h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        Add FAQs, opening hours, prices and services so your WhatsApp AI bot can answer customer questions accurately.
                    </p>
                    <Button onClick={handleOpenAdd} size="sm" className="rounded-xl">
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Entry
                    </Button>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {entries.map((item) => (
                        <Card key={item.id} className="rounded-2xl border-border/50 shadow-sm hover:border-border transition-all flex flex-col justify-between">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center space-x-2">
                                        <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                            {getCategoryIcon(item.category)}
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-bold text-foreground">
                                                {item.title}
                                            </CardTitle>
                                            <div className="flex items-center space-x-2 mt-0.5">
                                                <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                                                    {item.category}
                                                </Badge>
                                                {item.isVerified ? (
                                                    <span className="text-[10px] text-emerald-500 font-medium flex items-center">
                                                        <CheckCircle2 className="h-3 w-3 mr-0.5" /> Verified
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-amber-500 font-medium">
                                                        Draft / Review
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-lg"
                                            onClick={() => handleOpenEdit(item)}
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                                            onClick={() => setDeletingId(item.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="text-xs text-muted-foreground pt-0">
                                <p className="whitespace-pre-wrap line-clamp-4 leading-relaxed bg-muted/30 p-2.5 rounded-xl border border-border/30">
                                    {item.content}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* ADD / EDIT MODAL */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="max-w-lg rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center space-x-2">
                            <BookOpen className="h-5 w-5 text-primary" />
                            <span>{editingItem ? "Edit Knowledge Entry" : "Add Knowledge Entry"}</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            This factual data is indexed and referenced by your AI Bot when formulating customer answers.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-4 text-xs mt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Category</Label>
                                <Select 
                                    value={form.category} 
                                    onValueChange={(val) => setForm({ ...form, category: val })}
                                >
                                    <SelectTrigger className="rounded-xl border-border/60">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="FAQ">FAQ (Question & Answer)</SelectItem>
                                        <SelectItem value="SERVICE">Service Offering</SelectItem>
                                        <SelectItem value="PRODUCT">Product / Vehicle Spec</SelectItem>
                                        <SelectItem value="POLICY">Warranty & Policy</SelectItem>
                                        <SelectItem value="INSTRUCTION">Bot Instruction</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Verification Status</Label>
                                <Select 
                                    value={form.isVerified ? "true" : "false"} 
                                    onValueChange={(val) => setForm({ ...form, isVerified: val === "true" })}
                                >
                                    <SelectTrigger className="rounded-xl border-border/60">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="true">Verified Fact (Approved for Bot)</SelectItem>
                                        <SelectItem value="false">Draft / Pending Review</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-xs">Title / Subject *</Label>
                            <Input
                                required
                                placeholder="e.g. MFK Inspection & Warranty Terms"
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                className="rounded-xl border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-xs">Factual Content / Response Data *</Label>
                            <Textarea
                                required
                                rows={5}
                                placeholder="State clearly the exact facts, prices, conditions or rules the bot must follow."
                                value={form.content}
                                onChange={(e) => setForm({ ...form, content: e.target.value })}
                                className="rounded-xl border-border/60 leading-relaxed"
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setModalOpen(false)}
                                className="rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={saving}
                                className="rounded-xl shadow-md shadow-primary/20"
                            >
                                {saving ? "Saving..." : (editingItem ? "Save Changes" : "Add Entry")}
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
                            Delete Knowledge Entry
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Are you sure you want to remove this fact from your bot&apos;s knowledge base?
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="pt-3">
                        <Button variant="outline" onClick={() => setDeletingId(null)} className="rounded-xl">
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive" 
                            onClick={handleDelete} 
                            disabled={deleting}
                            className="rounded-xl"
                        >
                            {deleting ? "Deleting..." : "Delete Entry"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
