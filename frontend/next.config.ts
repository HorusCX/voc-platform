import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://voc-alb-478529380.eu-central-1.elb.amazonaws.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;
