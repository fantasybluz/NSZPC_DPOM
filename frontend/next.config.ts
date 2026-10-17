import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// 版號、更新紀錄：讀 repo 根目錄的 VERSION、CHANGELOG.md，建置時放進頁面（見 RELEASING.md）
const root = path.join(__dirname, "..");
const version = readFileSync(path.join(root, "VERSION"), "utf8").trim();
const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const buildSha = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
    NEXT_PUBLIC_CHANGELOG: changelog,
  },
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
