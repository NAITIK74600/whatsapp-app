import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { sendMetaTextMessage } from "@/lib/meta-whatsapp";

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const result = await sendMetaTextMessage(String(body.to || ""), String(body.message || ""));
        return NextResponse.json({ status: true, message: "Meta message sent successfully", data: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send Meta message";
        const status = message.includes("not configured") || message.includes("required") ? 400 : 502;
        return NextResponse.json({ status: false, error: message }, { status });
    }
}