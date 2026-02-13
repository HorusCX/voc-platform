import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const jobId = searchParams.get("job_id");

        if (!jobId) {
            return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
        }

        // Use BACKEND_URL from environment (Must be set in Amplify)
        const backendUrl = process.env.BACKEND_URL;

        if (!backendUrl) {
            console.error("Configuration Error: BACKEND_URL is missing");
            return NextResponse.json({
                error: "Configuration Error",
                details: "BACKEND_URL environment variable is not set"
            }, { status: 500 });
        }

        const targetUrl = `${backendUrl}/api/check-status?job_id=${jobId}`;
        console.log(`Proxying check-status to: ${targetUrl}`);

        const res = await fetch(targetUrl, {
            method: "GET",
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Backend returned ${res.status}: ${errorText}`);
            return NextResponse.json({ error: `Backend error: ${res.status}` }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error) {
        // Enhanced error logging for debugging
        const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
        console.error("Proxy error:", error);
        return NextResponse.json(
            {
                error: "Internal Server Error",
                details: error instanceof Error ? error.message : String(error),
                debug_backend_url: backendUrl
            },
            { status: 500 }
        );
    }
}
