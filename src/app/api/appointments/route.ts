import { NextResponse, NextRequest } from "next/server";
import { getTenantContext, recordAuditLog } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");

        const where: any = { tenantId: context.tenant.id };
        if (status && status !== "ALL") {
            where.status = status;
        }

        const appointments = await prisma.appointment.findMany({
            where,
            orderBy: { scheduledAt: "asc" }
        });

        return NextResponse.json({
            success: true,
            status: true,
            data: appointments
        });
    } catch (error: any) {
        console.error("Get appointments error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to fetch appointments",
            error: { code: "APPOINTMENTS_FETCH_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
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

        const body = await request.json().catch(() => ({}));
        const {
            customerName,
            customerPhone,
            serviceName,
            scheduledAt,
            notes,
            status = "REQUESTED"
        } = body;

        if (!customerName || !customerPhone || !scheduledAt) {
            return NextResponse.json({
                success: false,
                message: "Customer name, phone number, and appointment date/time are required",
                error: { code: "VALIDATION_ERROR", message: "Missing required fields" }
            }, { status: 400 });
        }

        const cleanPhone = customerPhone.replace(/[^0-9]/g, "");
        const customerJid = `${cleanPhone}@s.whatsapp.net`;

        const appointment = await prisma.appointment.create({
            data: {
                tenantId: context.tenant.id,
                customerJid,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                serviceName: serviceName?.trim() || "General Consultation",
                scheduledAt: new Date(scheduledAt),
                status: status || "REQUESTED",
                notes: notes?.trim() || null
            }
        });

        await recordAuditLog({
            tenantId: context.tenant.id,
            userId: context.user.id,
            action: "APPOINTMENT_CREATED",
            resource: `Appointment:${appointment.id}`,
            details: { customerName, scheduledAt },
            request
        });

        return NextResponse.json({
            success: true,
            status: true,
            message: "Appointment created successfully",
            data: appointment
        }, { status: 201 });

    } catch (error: any) {
        console.error("Create appointment error:", error);
        return NextResponse.json({
            success: false,
            status: false,
            message: "Failed to create appointment",
            error: { code: "APPOINTMENT_CREATE_FAILED", message: error.message || "Internal server error" }
        }, { status: 500 });
    }
}
