import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  transpilePackages: ["@bbcare/core", "@bbcare/db", "@bbcare/ai"],
  serverExternalPackages: ["postgres", "pino"],
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
      // Extra origins for previews behind a forwarding proxy, e.g. "*.app.github.dev".
      allowedOrigins: (process.env.BBCARE_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    },
  },
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
