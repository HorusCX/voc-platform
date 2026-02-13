import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose env vars to the runtime (especially for SSR/API routes in Amplify)
  env: {
    BACKEND_URL: process.env.BACKEND_URL,
  },
};

export default nextConfig;
