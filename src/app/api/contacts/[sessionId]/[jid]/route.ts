import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { z } from "zod";

const updateContactSchema = z.object({
  name: z.string().optional(),
  leadStage: z.enum(["NEW", "CONTACTED", "INTERESTED", "QUALIFIED", "CONVERTED", "LOST"]).optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, jid: rawJid } = await params;
    const jid = decodeURIComponent(rawJid);

    const canAccess = await canAccessSession(user.id, user.role, sessionId);
    if (!canAccess) {
      return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden" }, { status: 403 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (!sessionData) {
      return NextResponse.json({ status: false, message: "Session not found", error: "Not found" }, { status: 404 });
    }

    const contact = await prisma.contact.findFirst({
      where: {
        sessionId: sessionData.id,
        OR: [{ jid }, { remoteJidAlt: jid }],
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ status: false, message: "Contact not found", error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      status: true,
      data: contact,
    });
  } catch (error) {
    console.error("Error fetching contact detail:", error);
    return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, jid: rawJid } = await params;
    const jid = decodeURIComponent(rawJid);

    const canAccess = await canAccessSession(user.id, user.role, sessionId);
    if (!canAccess) {
      return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden" }, { status: 403 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (!sessionData) {
      return NextResponse.json({ status: false, message: "Session not found", error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const parseResult = updateContactSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ status: false, message: "Validation error", error: parseResult.error.flatten() }, { status: 400 });
    }

    const contact = await prisma.contact.findFirst({
      where: {
        sessionId: sessionData.id,
        OR: [{ jid }, { remoteJidAlt: jid }],
      },
    });

    if (!contact) {
      return NextResponse.json({ status: false, message: "Contact not found", error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: parseResult.data,
    });

    return NextResponse.json({
      status: true,
      message: "Contact updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ status: false, message: "Internal Server Error", error: "Internal Server Error" }, { status: 500 });
  }
}
