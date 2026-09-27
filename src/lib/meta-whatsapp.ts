import { createHmac, timingSafeEqual } from "node:crypto";

type MetaTextMessage = {
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    type: "text";
    text: {
        preview_url: boolean;
        body: string;
    };
};

const getConfig = () => {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID?.trim();

    if (!accessToken || !phoneNumberId) {
        throw new Error("Meta WhatsApp Cloud API is not configured");
    }

    return {
        accessToken,
        phoneNumberId,
        version: process.env.META_GRAPH_API_VERSION?.trim() || "v23.0",
    };
};

const normalizeRecipient = (recipient: string) => recipient.replace(/\D/g, "");

export async function sendMetaTextMessage(recipient: string, body: string) {
    const config = getConfig();
    const to = normalizeRecipient(recipient);

    if (!to) throw new Error("A valid recipient phone number is required");
    if (!body.trim()) throw new Error("Message text is required");

    const payload: MetaTextMessage = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: body.trim() },
    };

    const response = await fetch(
        `https://graph.facebook.com/${config.version}/${config.phoneNumberId}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        },
    );

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = data?.error?.message || "Meta WhatsApp API request failed";
        throw new Error(message);
    }

    return data;
}

export function verifyMetaWebhookSignature(rawBody: string, signature: string | null) {
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appSecret || !signature?.startsWith("sha256=")) return false;

    const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received);
}

export function getMetaWebhookVerifyToken() {
    return process.env.META_VERIFY_TOKEN?.trim();
}