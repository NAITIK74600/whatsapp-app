import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { 
    Shield, 
    Users, 
    LayoutDashboard, 
    ArrowRight, 
    Activity, 
    FileText, 
    Building2,
    Database,
    Sparkles
} from "lucide-react";
import { Toaster } from "sonner";

export default async function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login?callbackUrl=/super-admin");
    }

    if (session.user.role !== "SUPERADMIN") {
        redirect("/dashboard");
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col relative selection:bg-primary/20 selection:text-primary">
            {/* Ambient Background Glow */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute top-1/3 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
            </div>

            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                        <Link href="/super-admin" className="flex items-center space-x-3 group">
                            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-primary to-emerald-400 flex items-center justify-center text-white shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
                                <Shield className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <div className="flex items-center space-x-2">
                                    <span className="font-bold tracking-tight text-lg">WA-AKG</span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                        Super Admin
                                    </span>
                                </div>
                                <span className="text-xs text-muted-foreground">Multi-Client Management Platform</span>
                            </div>
                        </Link>

                        <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-border/40">
                            <Link
                                href="/super-admin"
                                className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-muted/60 transition-colors flex items-center space-x-1.5 text-foreground/80 hover:text-foreground"
                            >
                                <LayoutDashboard className="h-4 w-4" />
                                <span>Overview</span>
                            </Link>
                            <Link
                                href="/super-admin/clients"
                                className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-muted/60 transition-colors flex items-center space-x-1.5 text-foreground/80 hover:text-foreground"
                            >
                                <Building2 className="h-4 w-4" />
                                <span>Clients & Workspaces</span>
                            </Link>
                            <Link
                                href="/super-admin/audit-logs"
                                className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-muted/60 transition-colors flex items-center space-x-1.5 text-foreground/80 hover:text-foreground"
                            >
                                <Activity className="h-4 w-4" />
                                <span>Audit Logs</span>
                            </Link>
                        </nav>
                    </div>

                    <div className="flex items-center space-x-3">
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border/40 transition-all hover:shadow-sm"
                        >
                            <span>Client Workspace</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>

                        <div className="flex items-center space-x-2 pl-2 border-l border-border/40">
                            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                                {session.user.name ? session.user.name[0].toUpperCase() : "A"}
                            </div>
                            <div className="hidden sm:flex flex-col text-left">
                                <span className="text-xs font-semibold leading-none">{session.user.name || "Super Admin"}</span>
                                <span className="text-[11px] text-muted-foreground leading-none mt-1">{session.user.email}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Viewport */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 relative z-10">
                {children}
            </main>

            <Toaster position="top-right" richColors />
        </div>
    );
}
