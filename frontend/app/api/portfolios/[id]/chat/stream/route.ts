import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    if (!BACKEND_URL) {
        return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const authHeader = request.headers.get("Authorization");

    const backendResponse = await fetch(
        `${BACKEND_URL}/api/portfolios/${id}/chat/stream`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { Authorization: authHeader }),
            },
            body: JSON.stringify(body),
        }
    );

    if (!backendResponse.ok || !backendResponse.body) {
        const error = await backendResponse.text();
        return NextResponse.json({ detail: error }, { status: backendResponse.status });
    }

    // Pass the body stream through WITHOUT buffering — critical for SSE
    return new NextResponse(backendResponse.body, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    });
}
