import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        // Use BACKEND_URL from environment
        const backendUrl = process.env.BACKEND_URL;

        if (!backendUrl) {
            console.error("Configuration Error: BACKEND_URL is missing");
            return NextResponse.json({
                error: "Configuration Error",
                details: "BACKEND_URL environment variable is not set"
            }, { status: 500 });
        }

        const targetUrl = `${backendUrl}/api/analyze-website`;
        console.log(`Proxying analyze-website to: ${targetUrl}`);

        const body = await req.json();

        const res = await fetch(targetUrl, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Backend returned ${res.status}: ${errorText}`);
            return NextResponse.json({ error: `Backend error: ${res.status}`, details: errorText }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json(
            {
                error: "Internal Server Error",
                details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        );
    }
}
