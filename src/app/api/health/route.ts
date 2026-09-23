import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated health check.
 * Used by the server's keep-alive self-ping and external uptime monitors
 * (required on hosts that stop idle Node processes, e.g. Hostinger Web Apps).
 */
export async function GET() {
    let database = "ok";
    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch {
        database = "error";
    }
    return NextResponse.json(
        { status: database === "ok", database, uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() },
        { status: database === "ok" ? 200 : 503 }
    );
}
