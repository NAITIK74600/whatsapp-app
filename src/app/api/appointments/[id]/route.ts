import { NextResponse, NextRequest } from "next/server";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const context = await getTenantContext(request);
        if (!context || !context.tenant) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "No active tenant found",
                error: { code: "NO_TENANT", message: "No active workspace associated with account" }
            }, { status: 400 });
        }

        const resolvedParams = await params;
        const appointmentId = resolvedParams.id;

        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment || appointment.tenantId !== context.tenant.id) {
            return NextResponse.json({
                success: false,
                message: "Appointment not found in your workspace",
                error: { code: "NOT_FOUND", message: "Appointment not found" }
            }, { status: 404 });
        }

        const body = await request.json().catch(() => ({}));
        const updateData: any = {};

        if (body.status !== undefined) updateData.status = body.status;
        if (body.scheduledAt !== undefined) updateData.scheduledAt = new Date(body.scheduledAt);
        if (body.notes !== undefined) updateData.notes = body.notes;
        if (body.serviceName !== undefined) updateData.serviceName = body.serviceName;

        const updated = await prisma.appointment.update({
            where: { id: appointmentId },
            data: updateData
        });

        await recordAuditLog({
            tenantId: context.tenant.id,
            userId: context.user.id,
            action: `APPOINTMENT_${body.status || 'UPDATED'}`,
            resource: `Appointment:${appointmentId}`,
            details: updateData,
            request
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Appointment updated successfully",
            data: updated
        });

    } catch (error: any) {
        console.error("Update appointment error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to update appointment",
            error: { code: "APPOINTMENT_UPDATE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const context = await getTenantContext(request);
        if (!context || !context.tenant) {
            return NextResponse.json({
                success: false,
                status: false,
                message: "No active tenant found",
                error: { code: "NO_TENANT", message: "No active workspace associated with account" }
            }, { status: 400 });
        }

        const resolvedParams = await params;
        const appointmentId = resolvedParams.id;

        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment || appointment.tenantId !== context.tenant.id) {
            return NextResponse.json({
                success: false,
                message: "Appointment not found in your workspace",
                error: { code: "NOT_FOUND", message: "Appointment not found" }
            }, { status: 404 });
        }

        await prisma.appointment.delete({
            where: { id: appointmentId }
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Appointment deleted successfully"
        });

    } catch (error: any) {
        console.error("Delete appointment error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to delete appointment",
            error: { code: "APPOINTMENT_DELETE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
