import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    if (!BACKEND_URL) {
        return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
    }

    try {
        const body = await request.json();
        const resolvedParams = await params;
        const path = resolvedParams.path.join('/');

        const response = await fetch(`${BACKEND_URL}/api/auth/${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`Auth proxy error:`, error);
        return NextResponse.json(
            { detail: "Failed to connect to authentication service" },
            { status: 500 }
        );
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    if (!BACKEND_URL) {
        return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
    }

    try {
        const resolvedParams = await params;
        const path = resolvedParams.path.join('/');
        const authHeader = request.headers.get("Authorization");

        const response = await fetch(`${BACKEND_URL}/api/auth/${path}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`Auth proxy error:`, error);
        return NextResponse.json(
            { detail: "Failed to connect to authentication service" },
            { status: 500 }
        );
    }
}
