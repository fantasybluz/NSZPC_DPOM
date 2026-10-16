import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // repo 根目錄（Worker）和 frontend 各有一份 package-lock.json，明講前端的根目錄在這裡
  turbopack: { root: path.join(__dirname) },
  // 只在 next dev 有效：API 交給 wrangler dev（npm run dev，8787）
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8787/api/:path*" },
    ];
  },
};

export default nextConfig;
