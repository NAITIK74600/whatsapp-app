import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { recordAuditLog } from "@/lib/tenant-context";
import bcrypt from "bcryptjs";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { status: false, message: "Unauthorized", error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parseResult = changePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          status: false,
          message: "Validation error",
          error: parseResult.error.issues[0]?.message || "Invalid input",
        },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        memberships: {
          select: { tenantId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { status: false, message: "User not found", error: "User not found" },
        { status: 404 }
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json(
        { status: false, message: "Incorrect current password", error: "Incorrect current password" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    });

    const tenantId = user.memberships[0]?.tenantId || null;

    await recordAuditLog({
      tenantId,
      userId: user.id,
      action: "PASSWORD_CHANGED",
      resource: `user:${user.id}`,
      details: { email: user.email },
    });

    return NextResponse.json({
      status: true,
      message: "Password changed successfully. Your account is now fully secured.",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { status: false, message: "Failed to change password", error: "Internal server error" },
      { status: 500 }
    );
  }
}
