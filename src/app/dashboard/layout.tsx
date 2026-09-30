import { auth } from "@/lib/auth";
import { Navbar } from "@/components/dashboard/navbar";
import { SessionProvider } from "@/components/dashboard/session-provider";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { SidebarShell } from "@/components/dashboard/sidebar-shell";
import { UpdateChecker } from "@/components/dashboard/update-checker";
import { RegistrationWarning } from "@/components/dashboard/registration-warning";
import { prisma } from "@/lib/prisma";
import { Toaster } from "sonner";
import pkg from "../../../package.json";
import { getTenantContext } from "@/lib/tenant-context";

import { ForcePasswordChangeModal } from "@/components/dashboard/force-password-change-modal";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    // @ts-ignore
    const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });
    const appName = (systemConfig?.appName && systemConfig.appName !== "WA-AKG") ? systemConfig.appName : "WhatsApp Bot";
    const registrationEnabled = systemConfig?.enableRegistration ?? true;

    const tenantContext = await getTenantContext();
    const activeTenant = tenantContext?.tenant;
    const isSuspended = activeTenant?.status === "SUSPENDED" && !tenantContext?.isSuperAdmin;

    // Direct check of user mustChangePassword state (only for client workspace users, never SuperAdmin)
    let mustChangePassword = false;
    const isSuperAdminUser = (session?.user as any)?.role === "SUPERADMIN" ||
        tenantContext?.isSuperAdmin ||
        session?.user?.email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase()?.trim();

    if (session?.user?.id && !isSuperAdminUser) {
        const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { mustChangePassword: true, role: true }
        });
        mustChangePassword = !!dbUser?.mustChangePassword && dbUser.role !== "SUPERADMIN";
    }

    return (
        <SessionProvider>
            <SidebarProvider>
                <UpdateChecker />
                <ForcePasswordChangeModal
                    mustChange={mustChangePassword}
                    userEmail={session?.user?.email}
                />
                <RegistrationWarning
                    role={session?.user?.role as string}
                    registrationEnabled={registrationEnabled}
                />
                <div className="flex h-screen bg-background relative overflow-hidden" suppressHydrationWarning={true}>
                    {/* Subtle ambient background */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" suppressHydrationWarning={true}>
                        <div className="absolute -top-[20%] -left-[10%] w-[35rem] h-[35rem] bg-primary/[0.03] rounded-full blur-[100px]" />
                        <div className="absolute -bottom-[20%] -right-[10%] w-[25rem] h-[25rem] bg-blue-500/[0.03] rounded-full blur-[80px]" />
                    </div>

                    {/* Sidebar */}
                    <SidebarShell
                        appName={activeTenant?.name || appName}
                        userName={session?.user?.name}
                        userEmail={session?.user?.email}
                        version={pkg.version}
                    />

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10" suppressHydrationWarning={true}>
                        <Navbar appName={appName} tenantName={activeTenant?.name} />
                        <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 styled-scrollbar">
                            {isSuspended ? (
                                <div className="p-8 max-w-2xl mx-auto my-12 text-center rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive space-y-3">
                                    <h2 className="text-xl font-bold">Workspace Suspended</h2>
                                    <p className="text-sm text-muted-foreground">
                                        This client workspace has been suspended by the platform administrator. Access to WhatsApp sessions and automations is temporarily restricted.
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Please contact support to restore account privileges.
                                    </p>
                                </div>
                            ) : (
                                children
                            )}
                        </main>
                    </div>
                    <Toaster />
                </div>
            </SidebarProvider>
        </SessionProvider>
    );
}

