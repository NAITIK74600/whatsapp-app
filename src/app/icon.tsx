import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

// Use nodejs runtime to allow Prisma access
export const runtime = "nodejs";
// Render per request so the app-name letter reflects the DB config (and isn't baked in at build time)
export const dynamic = "force-dynamic";

// Image metadata
export const size = {
    width: 32,
    height: 32,
};
export const contentType = "image/png";

// Image generation
export default async function Icon() {
    // Default config
    let letter = "W";
    const color = "#16a34a"; // green-600

    // Skip the DB during `next build` — the build sandbox may not reach the database.
    if (process.env.NEXT_PHASE !== "phase-production-build") {
        try {
            const config = await prisma.systemConfig.findUnique({
                where: { id: "default" }
            });

            if (config?.appName) {
                letter = config.appName.charAt(0).toUpperCase();
            }
        } catch (e) {
            console.error("Failed to fetch favicon config", e);
        }
    }

    return new ImageResponse(
        (
            // ImageResponse JSX element
            <div
                style={{
                    fontSize: 20,
                    fontWeight: 800,
                    background: color,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    borderRadius: "20%", // Rounded square looks more app-like
                    fontFamily: 'sans-serif'
                }}
            >
                {letter}
            </div>
        ),
        // ImageResponse options
        {
            ...size,
        }
    );
}
