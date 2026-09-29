import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import bcrypt from "bcryptjs";
import { z } from "zod";

const inviteMemberSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Initial temporary password must be at least 6 characters"),
  role: z.enum(["ADMIN", "MANAGER", "AGENT", "VIEWER"]).default("AGENT"),
});

export async function GET(request: NextRequest) {
  try {
    const tenantCtx = await getTenantContext(request);
    if (!tenantCtx || !tenantCtx.tenant) {
      return NextResponse.json(
        { status: false, message: "Tenant context not found", error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { tenant, tenantRole, isSuperAdmin } = tenantCtx;

    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            mustChangePassword: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      status: true,
      data: {
        members: memberships.map((m) => ({
          membershipId: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          mustChangePassword: m.user.mustChangePassword,
          joinedAt: m.createdAt,
        })),
        limits: {
          currentEmployees: memberships.length,
          maxEmployees: tenant.maxEmployees,
          plan: tenant.plan,
        },
        callerRole: tenantRole,
        isSuperAdmin,
      },
    });
  } catch (error) {
    console.error("Fetch team error:", error);
    return NextResponse.json(
      { status: false, message: "Failed to fetch team members", error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantCtx = await getTenantContext(request);
    if (!tenantCtx || !tenantCtx.tenant) {
      return NextResponse.json(
        { status: false, message: "Tenant context not found", error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { tenant, tenantRole, isSuperAdmin, user: authUser } = tenantCtx;

    // Only OWNER, ADMIN, or SUPERADMIN can invite members
    if (!isSuperAdmin && tenantRole !== "OWNER" && tenantRole !== "ADMIN") {
      return NextResponse.json(
        { status: false, message: "Permission denied. Only Owner or Admin can manage team members.", error: "Forbidden" },
        { status: 403 }
      );
    }

    // Check usage limits against current plan
    const currentCount = await prisma.tenantMembership.count({
      where: { tenantId: tenant.id },
    });

    if (currentCount >= tenant.maxEmployees) {
      return NextResponse.json(
        {
          status: false,
          message: `Plan limit reached (${currentCount}/${tenant.maxEmployees}). Upgrade your plan to invite more employees.`,
          code: "EMPLOYEE_LIMIT_EXCEEDED",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parseResult = inviteMemberSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { status: false, message: "Validation error", error: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, role: memberRole } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { memberships: true },
    });

    if (user) {
      const alreadyInTenant = user.memberships.some((m: any) => m.tenantId === tenant.id);
      if (alreadyInTenant) {
        return NextResponse.json(
          { status: false, message: "A user with this email is already a member of your workspace.", error: "Duplicate member" },
          { status: 400 }
        );
      }
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
          role: "STAFF",
          mustChangePassword: true,
        },
        include: { memberships: true },
      });
    }

    // Create TenantMembership
    const membership = await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: memberRole,
      },
    });

    await recordAuditLog({
      tenantId: tenant.id,
      userId: authUser.id,
      action: "TEAM_MEMBER_INVITED",
      resource: `membership:${membership.id}`,
      details: {
        invitedEmail: normalizedEmail,
        assignedRole: memberRole,
        tenantName: tenant.name,
      },
    });

    return NextResponse.json(
      {
        status: true,
        message: `Employee ${name} (${normalizedEmail}) invited successfully as ${memberRole}.`,
        data: {
          membershipId: membership.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          role: membership.role,
          mustChangePassword: user.mustChangePassword,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Invite team member error:", error);
    return NextResponse.json(
      { status: false, message: "Failed to invite team member", error: "Internal server error" },
      { status: 500 }
    );
  }
}
