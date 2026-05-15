import "./env/server.ts";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactCompiler: true,
  async rewrites() {
    return [{ source: "/next-config-rewrite", destination: "/next-apis" }];
  },
  async redirects() {
    return [{ source: "/next-config-redirect", destination: "/next-apis", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/next-apis",
        headers: [{ key: "x-next-config-header", value: "notes-demo" }],
      },
    ];
  },
  images: {
    path: "/custom-next-image",
  },
  experimental: {
    authInterrupts: true,
    rootParams: true,
  },
  serverExternalPackages: ["@electric-sql/pglite", "drizzle-kit"],
};

export default nextConfig;
