import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });

    try {
        const body = await request.json();
        const authHeader = request.headers.get("Authorization");
        const { id } = await params;

        const targetUrl = `${BACKEND_URL}/api/portfolios/${id}/invite`;
        console.log("🚀 Inviting to portfolio:", { id, email: body.email, targetUrl });

        if (!BACKEND_URL) {
            console.error("❌ BACKEND_URL is missing!");
            return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
        }

        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
            body: JSON.stringify(body),
        });

        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error("❌ Backend returned non-JSON response:", { status: response.status, text });
            return NextResponse.json({
                detail: "Backend returned an error",
                error: text,
                status: response.status
            }, { status: response.status });
        }

        console.log("✅ Backend response:", { status: response.status, data });
        return NextResponse.json(data, { status: response.status });
    } catch (error: unknown) {
        console.error("❌ Invite proxy error:", (error as Error).message || error);
        return NextResponse.json({
            detail: "Failed to connect to backend",
            error: (error as Error).message || String(error)
        }, { status: 500 });
    }
}
