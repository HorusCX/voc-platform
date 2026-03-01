import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function GET(request: NextRequest) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });

    try {
        const authHeader = request.headers.get("Authorization");

        const response = await fetch(`${BACKEND_URL}/api/companies`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json({ detail: "Failed to connect to backend" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });

    try {
        const body = await request.json();
        const authHeader = request.headers.get("Authorization");

        const response = await fetch(`${BACKEND_URL}/api/companies`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json({ detail: "Failed to connect to backend" }, { status: 500 });
    }
}
