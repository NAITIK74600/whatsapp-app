import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/tenant-context";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

// GET: List all client tenants with owner, plan, sessions, and usage metrics
export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !isAdmin(user.role)) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "FORBIDDEN", message: "Super Admin privileges required" }
            }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search")?.trim() || "";
        const status = searchParams.get("status")?.trim() || "";

        const where: any = {};
        if (status && status !== "ALL") {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { slug: { contains: search } },
                { email: { contains: search } },
                { businessCategory: { contains: search } }
            ];
        }

        const clients = await prisma.tenant.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                memberships: {
                    where: { role: "OWNER" },
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, phone: true, createdAt: true }
                        }
                    }
                },
                sessions: {
                    select: { id: true, sessionId: true, name: true, status: true, createdAt: true }
                },
                _count: {
                    select: {
                        sessions: true,
                        memberships: true,
                        knowledgeEntries: true,
                        appointments: true,
                        campaigns: true
                    }
                }
            }
        });

        // Enrich with owner info and active session count
        const formatted = clients.map((client) => {
            const owner = client.memberships[0]?.user || null;
            const connectedSessions = client.sessions.filter(s => s.status === "CONNECTED").length;
            return {
                id: client.id,
                name: client.name,
                slug: client.slug,
                status: client.status,
                plan: client.plan,
                businessCategory: client.businessCategory,
                country: client.country,
                timezone: client.timezone,
                preferredLanguage: client.preferredLanguage,
                phone: client.phone,
                email: client.email,
                website: client.website,
                description: client.description,
                limits: {
                    maxSessions: client.maxSessions,
                    maxEmployees: client.maxEmployees,
                    maxMonthlyMessages: client.maxMonthlyMessages,
                    maxContacts: client.maxContacts,
                    maxAutoReplies: client.maxAutoReplies,
                    aiTokenLimit: client.aiTokenLimit
                },
                owner: owner ? {
                    id: owner.id,
                    name: owner.name,
                    email: owner.email,
                    phone: owner.phone
                } : null,
                stats: {
                    totalSessions: client._count.sessions,
                    connectedSessions,
                    totalTeam: client._count.memberships,
                    knowledgeCount: client._count.knowledgeEntries
                },
                notes: client.notes,
                supportContact: client.supportContact,
                onboardingCompleted: client.onboardingCompleted,
                createdAt: client.createdAt,
                updatedAt: client.updatedAt
            };
        });

        return NextResponse.json({
            success: true,
            status: true,
            data: formatted
        });
    } catch (error: any) {
        console.error("Fetch clients error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to fetch clients",
            error: { code: "FETCH_CLIENTS_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}

// POST: Add and Provision a New Client Workspace
export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !isAdmin(user.role)) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "Unauthorized",
                error: { code: "FORBIDDEN", message: "Super Admin privileges required" }
            }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const {
            businessName,
            ownerName,
            email,
            businessCategory,
            country = "Switzerland",
            timezone = "Europe/Zurich",
            preferredLanguage = "de",
            plan = "STARTER",
            status = "ACTIVE",
            phone,
            notes,
            supportContact,
            maxSessions,
            maxMonthlyMessages
        } = body;

        // Validation
        if (!businessName || typeof businessName !== "string" || !businessName.trim()) {
            return NextResponse.json({
                success: false,
                message: "Business name is required",
                error: { code: "VALIDATION_ERROR", message: "Business name is required" }
            }, { status: 400 });
        }

        if (!email || typeof email !== "string" || !email.includes("@")) {
            return NextResponse.json({
                success: false,
                message: "A valid owner email address is required",
                error: { code: "VALIDATION_ERROR", message: "A valid owner email is required" }
            }, { status: 400 });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanBusinessName = businessName.trim();

        // Generate unique slug
        let baseSlug = cleanBusinessName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
        if (!baseSlug) baseSlug = "client";

        let slug = baseSlug;
        let counter = 1;
        while (await prisma.tenant.findUnique({ where: { slug } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        // Generate strong temporary password
        const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
        const tempPassword = `Client#${randomHex}!${new Date().getFullYear()}`;
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Find or create User
        let ownerUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
        let isNewUser = false;

        if (!ownerUser) {
            isNewUser = true;
            ownerUser = await prisma.user.create({
                data: {
                    name: ownerName?.trim() || cleanBusinessName,
                    email: cleanEmail,
                    password: hashedPassword,
                    phone: phone?.trim() || null,
                    role: "OWNER",
                    mustChangePassword: true
                }
            });
        }

        // Set Plan limits
        const defaultLimitsByPlan: Record<string, { sessions: number; messages: number; team: number }> = {
            STARTER: { sessions: 1, messages: 1000, team: 2 },
            PROFESSIONAL: { sessions: 3, messages: 5000, team: 5 },
            BUSINESS: { sessions: 5, messages: 15000, team: 15 },
            ENTERPRISE: { sessions: 20, messages: 100000, team: 50 }
        };

        const limits = defaultLimitsByPlan[plan] || defaultLimitsByPlan.STARTER;

        // Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: cleanBusinessName,
                slug,
                status: status || "ACTIVE",
                plan: plan || "STARTER",
                businessCategory: businessCategory?.trim() || "General Business",
                country: country?.trim() || "Switzerland",
                timezone: timezone?.trim() || "Europe/Zurich",
                preferredLanguage: preferredLanguage?.trim() || "de",
                phone: phone?.trim() || null,
                email: cleanEmail,
                notes: notes?.trim() || null,
                supportContact: supportContact?.trim() || "Naitik (Platform Admin)",
                maxSessions: maxSessions ? parseInt(maxSessions) : limits.sessions,
                maxMonthlyMessages: maxMonthlyMessages ? parseInt(maxMonthlyMessages) : limits.messages,
                maxEmployees: limits.team
            }
        });

        // Link Membership
        await prisma.tenantMembership.create({
            data: {
                tenantId: tenant.id,
                userId: ownerUser.id,
                role: "OWNER",
                isDefault: true
            }
        });

        // Seed initial Knowledge Base category templates
        await prisma.knowledgeEntry.createMany({
            data: [
                {
                    tenantId: tenant.id,
                    category: "FAQ",
                    title: "Opening Hours & Location",
                    content: "Please update your opening hours and physical business address here.",
                    isVerified: false
                },
                {
                    tenantId: tenant.id,
                    category: "SERVICE",
                    title: "Core Services / Products",
                    content: "List key services, pricing, or product catalog information.",
                    isVerified: false
                }
            ]
        });

        // Record Audit Log
        await recordAuditLog({
            tenantId: tenant.id,
            userId: user.id,
            action: "CLIENT_PROVISIONED",
            resource: `Tenant:${tenant.id}`,
            details: {
                businessName: tenant.name,
                ownerEmail: cleanEmail,
                plan: tenant.plan,
                slug: tenant.slug
            },
            request
        });

        // Format onboarding message
        const sysConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } }).catch(() => null);
        const configuredBase = sysConfig?.baseUrl || process.env.BASE_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
        let origin = "";
        if (configuredBase && !configuredBase.includes("localhost")) {
            origin = configuredBase.replace(/\/$/, "");
        } else {
            const proto = request.headers.get("x-forwarded-proto") || "https";
            const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
            if (host && !host.includes("localhost")) {
                origin = `${proto}://${host}`;
            } else {
                origin = request.nextUrl.origin ? request.nextUrl.origin.replace(/\/$/, "") : "http://localhost:3000";
                if (origin.startsWith("https://localhost")) {
                    origin = origin.replace("https://", "http://");
                }
            }
        }
        const loginUrl = `${origin}/auth/login`;

        const onboardingMessage = `🎉 Welcome to your WhatsApp Automation Workspace!

Your client account has been configured:
🏢 Business: ${tenant.name}
🌐 Login URL: ${loginUrl}
📧 Email: ${cleanEmail}
${isNewUser ? `🔑 Temporary Password: ${tempPassword}` : `(Your existing platform password remains active)`}

Initial Setup Instructions:
1. Log in at ${loginUrl}
2. Connect your business WhatsApp under "Sessions / QR" by scanning the QR code with WhatsApp Linked Devices
3. Customize your Business Profile and AI Bot instructions under "Bot Settings"
4. Add your FAQs and service details under "Knowledge Base"

For technical assistance, contact your administrator: ${tenant.supportContact}`;

        return NextResponse.json({
            success: true,
            status: true,
            message: "Client workspace successfully created",
            data: {
                tenant: {
                    id: tenant.id,
                    name: tenant.name,
                    slug: tenant.slug,
                    plan: tenant.plan,
                    status: tenant.status
                },
                owner: {
                    id: ownerUser.id,
                    email: ownerUser.email,
                    name: ownerUser.name,
                    isNewUser
                },
                credentials: isNewUser ? {
                    email: cleanEmail,
                    temporaryPassword: tempPassword,
                    loginUrl
                } : null,
                onboardingMessage
            }
        }, { status: 201 });

    } catch (error: any) {
        console.error("Provision client error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to provision client workspace",
            error: { code: "PROVISION_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
