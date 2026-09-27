import { NextRequest, NextResponse } from "next/server";
import { getMetaWebhookVerifyToken, verifyMetaWebhookSignature } from "@/lib/meta-whatsapp";

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const verifyToken = getMetaWebhookVerifyToken();

    if (
        params.get("hub.mode") === "subscribe" &&
        verifyToken &&
        params.get("hub.verify_token") === verifyToken
    ) {
        return new NextResponse(params.get("hub.challenge") || "", { status: 200 });
    }

    return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!verifyMetaWebhookSignature(rawBody, signature)) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    try {
        const payload = JSON.parse(rawBody);
        if (payload.object !== "whatsapp_business_account") {
            return NextResponse.json({ error: "Unsupported webhook object" }, { status: 400 });
        }

        console.info("Meta WhatsApp webhook received", {
            entries: Array.isArray(payload.entry) ? payload.entry.length : 0,
        });
        return NextResponse.json({ received: true });
    } catch {
        return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }
}