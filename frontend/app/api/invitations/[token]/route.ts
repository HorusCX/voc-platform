import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });

    try {
        const { token } = await params;

        const response = await fetch(`${BACKEND_URL}/api/invitations/${token}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error("Get invitation error:", error);
        return NextResponse.json({ detail: "Failed to connect to backend" }, { status: 500 });
    }
}
