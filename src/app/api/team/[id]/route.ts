import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateMemberSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"]).optional(),
  temporaryPassword: z.string().min(6).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: membershipId } = await params;
    const tenantCtx = await getTenantContext(request);
    if (!tenantCtx || !tenantCtx.tenant) {
      return NextResponse.json(
        { status: false, message: "Tenant context not found", error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { tenant, tenantRole, isSuperAdmin, user: authUser } = tenantCtx;

    if (!isSuperAdmin && tenantRole !== "OWNER" && tenantRole !== "ADMIN") {
      return NextResponse.json(
        { status: false, message: "Permission denied", error: "Forbidden" },
        { status: 403 }
      );
    }

    const membership = await prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      include: { user: true },
    });

    if (!membership || membership.tenantId !== tenant.id) {
      return NextResponse.json(
        { status: false, message: "Team member not found in this workspace", error: "Not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parseResult = updateMemberSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { status: false, message: "Validation error", error: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { role: newRole, temporaryPassword } = parseResult.data;

    // Check if demoting the only OWNER
    if (membership.role === "OWNER" && newRole && newRole !== "OWNER") {
      const ownerCount = await prisma.tenantMembership.count({
        where: { tenantId: tenant.id, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { status: false, message: "Cannot demote the only Owner of this workspace.", error: "Forbidden" },
          { status: 400 }
        );
      }
    }

    if (newRole) {
      await prisma.tenantMembership.update({
        where: { id: membership.id },
        data: { role: newRole },
      });
    }

    if (temporaryPassword) {
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      await prisma.user.update({
        where: { id: membership.userId },
        data: {
          password: hashedPassword,
          mustChangePassword: true,
        },
      });
    }

    await recordAuditLog({
      tenantId: tenant.id,
      userId: authUser.id,
      action: "TEAM_MEMBER_UPDATED",
      resource: `membership:${membership.id}`,
      details: {
        targetUser: membership.user.email,
        updatedRole: newRole || membership.role,
        passwordReset: !!temporaryPassword,
      },
    });

    return NextResponse.json({
      status: true,
      message: "Team member updated successfully.",
    });
  } catch (error) {
    console.error("Update team member error:", error);
    return NextResponse.json(
      { status: false, message: "Failed to update team member", error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: membershipId } = await params;
    const tenantCtx = await getTenantContext(request);
    if (!tenantCtx || !tenantCtx.tenant) {
      return NextResponse.json(
        { status: false, message: "Tenant context not found", error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { tenant, tenantRole, isSuperAdmin, user: authUser } = tenantCtx;

    if (!isSuperAdmin && tenantRole !== "OWNER") {
      return NextResponse.json(
        { status: false, message: "Only the Workspace Owner can remove team members.", error: "Forbidden" },
        { status: 403 }
      );
    }

    const membership = await prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      include: { user: true },
    });

    if (!membership || membership.tenantId !== tenant.id) {
      return NextResponse.json(
        { status: false, message: "Team member not found in this workspace", error: "Not found" },
        { status: 404 }
      );
    }

    // Protect last owner
    if (membership.role === "OWNER") {
      const ownerCount = await prisma.tenantMembership.count({
        where: { tenantId: tenant.id, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { status: false, message: "Cannot remove the only Owner of this workspace.", error: "Forbidden" },
          { status: 400 }
        );
      }
    }

    await prisma.tenantMembership.delete({
      where: { id: membership.id },
    });

    await recordAuditLog({
      tenantId: tenant.id,
      userId: authUser.id,
      action: "TEAM_MEMBER_REMOVED",
      resource: `membership:${membership.id}`,
      details: {
        removedEmail: membership.user.email,
        removedRole: membership.role,
      },
    });

    return NextResponse.json({
      status: true,
      message: "Team member removed from workspace.",
    });
  } catch (error) {
    console.error("Delete team member error:", error);
    return NextResponse.json(
      { status: false, message: "Failed to remove team member", error: "Internal server error" },
      { status: 500 }
    );
  }
}
