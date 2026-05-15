import "./env/server.ts";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactCompiler: true,
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
