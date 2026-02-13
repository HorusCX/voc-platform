import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const jobId = searchParams.get("job_id");

        if (!jobId) {
            return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
        }

        // Use BACKEND_URL from environment, fallback to localhost
        // IMPORTANT: This runs on the server (Lambda), so it can access HTTP
        const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
        const targetUrl = `${backendUrl}/api/check-status?job_id=${jobId}`;

        console.log(`Proxying check-status to: ${targetUrl}`);

        const res = await fetch(targetUrl, {
            method: "GET",
            // Forward headers if needed, but simple fetch usually enough
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Backend returned ${res.status}: ${errorText}`);
            return NextResponse.json({ error: `Backend error: ${res.status}` }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
