import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const backendUrl = process.env.BACKEND_URL;

        if (!backendUrl) {
            return NextResponse.json({ error: "Configuration Error: BACKEND_URL is missing" }, { status: 500 });
        }

        const targetUrl = `${backendUrl}/api/scrap-reviews`;
        const body = await req.json();

        const res = await fetch(targetUrl, {
            method: "POST",
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errorText = await res.text();
            return NextResponse.json({ error: `Backend error: ${res.status}`, details: errorText }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error", details: String(error) }, { status: 500 });
    }
}
