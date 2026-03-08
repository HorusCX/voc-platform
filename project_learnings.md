# Project Learnings & Troubleshooting Guide

This document captures key technical findings and solutions discovered during development to prevent recurring issues.

## 1. AWS Amplify & Mixed Content (HTTPS -> HTTP)
**Problem**: The Frontend (hosted on Amplify) determines via HTTPS, but the Backend (ALB/EC2) is HTTP. Browsers block direct API calls from HTTPS to HTTP due to "Mixed Content" security policies.

**What DOES NOT Work**:
*   **Amplify Rewrites**: Custom rules in Amplify checks (`/api/* -> http://backend/*`) **fail** because Amplify only supports HTTPS targets for rewrites.

**The Solution**: Next.js API Route Proxy (Server-Side)
*   **Strategy**: Use Next.js API routes as a middleman.
    1.  **Browser** calls `https://frontend.com/api/proxy` (Secure).
    2.  **Next.js Server** (Node.js) calls `http://backend-api.com` (Server-to-Server communication is not blocked by browser security).
    3.  **Next.js Server** returns the response to the browser.
*   **Implementation**:
    *   Create a route handler (e.g., `frontend/app/api/check-status/route.ts`).
    *   Use `fetch` within this handler to call the backend.
    *   **Crucial**: Pass the `BACKEND_URL` environment variable to the Next.js runtime.

## 2. Persistent S3 Links (Fixing "ExpiredToken")
**Problem**: S3 Presigned URLs generated with temporary AWS credentials (e.g., partial IAM roles) expire when the session expires, even if the URL's `ExpiresIn` parameter is set to a long duration.

**The Solution**: Dynamic Redirect Endpoint
*   **Concept**: Never embed the final S3 URL in emails or databases if using temporary credentials.
*   **Implementation**:
    1.  **Email**: Send a link to your application with an ID (e.g., `.../dashboard?job_id=123`).
    2.  **Frontend**: Calls the backend to "get updated status" for `job_id=123`.
    3.  **Backend**:
        *   Receives the request.
        *   Generates a **fresh** presigned URL at that exact moment.
        *   Returns the new URL or redirects the user to it.
*   **Benefit**: The link works forever because a valid, new token is created on every click.

## 3. Next.js Environment Variables in Amplify
**Findings**:
*   **Client-Side (`NEXT_PUBLIC_*`)**: These are **hardcoded** into the JS bundle at **build time**. Changing them in Amplify Console requires a **re-build/re-deploy**.
*   **Server-Side (`process.env.*`)**: Used in API Routes.
    *   In some Next.js configurations (standalone/Amplify), these might be missing at runtime.
    *   **Fix**: Explicitly expose them in `next.config.ts`:
        ```typescript
        const nextConfig = {
          env: {
            BACKEND_URL: process.env.BACKEND_URL, // Forces the value to be available
          },
        };
        ```

## 4. Deployment Scripts
**Guidance**:
*   Scripts like `deploy_frontend.sh` that function with `read -p "Enter commit message"` will hang in automated or non-interactive environments.
*   **Fix**: Always verify if a script is waiting for input if deployment seems stuck.

## 5. Next.js 404 Errors on New API Endpoints (Missing Proxy Routes)
**Problem**: After creating a new endpoint in the FastAPI backend (e.g., `/api/portfolios/{id}/chat`), frontend `fetch` calls or `axios` requests to that URL return a `404 Not Found` error and often result in a Syntax Error (`Unexpected token < in JSON`) because Next.js returns an HTML error page.

**The Solution**:
*   The frontend uses a relative URL (e.g., `/api/...`) which Next.js intercepts. Because of the Amplify HTTPS -> HTTP Mixed Content issue (see Point #1), the frontend does NOT communicate directly with the backend.
*   **Fix**: Every time a new backend API is created, you **must** also create a corresponding Next.js Route Handler file in the frontend (`frontend/app/api/.../route.ts`) to act as a proxy.
*   **Example Proxy Code**:
    ```typescript
    import { NextRequest, NextResponse } from "next/server";
    const BACKEND_URL = process.env.BACKEND_URL;
    
    export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
        if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
        try {
            const { id } = await params;
            const body = await request.json();
            const authHeader = request.headers.get("Authorization");
            
            const response = await fetch(`${BACKEND_URL}/api/your-new-endpoint/${id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(authHeader && { "Authorization": authHeader }),
                },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            return NextResponse.json(data, { status: response.status });
        } catch (error) {
            return NextResponse.json({ detail: "Failed to connect to backend" }, { status: 500 });
        }
    }
    ```

## 6. LangChain SQL Agent: "Agent stopped due to max iterations."
**Problem**: The AI Chat function returns an error `Agent stopped due to max iterations.` when processing queries that involve multiple tables or aggregations (like "how many reviews each company got for each month in the last 3 months").

**The Solution**:
*   The default `max_iterations` for LangChain's SQL agent executor is often too low (e.g., 5 or 15). Every action the agent takes (Listing tables, Getting Schema, Checking SQL, Executing SQL, Fixing Errors) counts as an "iteration".
*   For complex queries, the agent naturally needs more iterations to explore the database schema and validate its SQL before executing it.
*   **Fix**: Increase the `max_iterations` parameter when initializing the agent executor.
*   **Example Code**:
    ```python
    agent_executor = create_sql_agent(
        llm, 
        db=db, 
        agent_type="openai-tools", 
        verbose=True,
        prefix=prefix,
        max_iterations=15 # Increased from 5 to allow more turns
    )
    ```

---
*Created: 2026-02-13*
*Updated: 2026-03-08*
