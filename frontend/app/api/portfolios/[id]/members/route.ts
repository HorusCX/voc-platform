import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });

    try {
        const authHeader = request.headers.get("Authorization");
        const { id } = await params;

        const targetUrl = `${BACKEND_URL}/api/portfolios/${id}/members`;
        console.log("🚀 Fetching portfolio members:", { id, targetUrl });

        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
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

        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        console.error("❌ Members proxy error:", error.message || error);
        return NextResponse.json({
            detail: "Failed to connect to backend",
            error: error.message || String(error)
        }, { status: 500 });
    }
}
