import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
    try {
        // Handle Next.js 15+ async params
        const { id } = await params;
        const authHeader = request.headers.get("Authorization");

        const response = await fetch(`${BACKEND_URL}/api/portfolios/${id}/conversations`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ detail: "Failed to connect to backend", error: String(error) }, { status: 500 });
    }
}
