import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });

    try {
        const { id } = await context.params;
        const body = await request.json();
        const authHeader = request.headers.get("Authorization");

        const response = await fetch(`${BACKEND_URL}/api/portfolios/${id}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error("Chat proxy error:", error);
        return NextResponse.json({ detail: "Failed to connect to backend" }, { status: 500 });
    }
}
