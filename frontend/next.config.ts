import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // 只在 next dev 有效：API 交給 wrangler dev（npm run dev，8787）
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8787/api/:path*" },
    ];
  },
};

export default nextConfig;
