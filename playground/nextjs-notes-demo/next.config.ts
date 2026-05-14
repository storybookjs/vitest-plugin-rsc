import "./env/server.ts";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactCompiler: true,
  experimental: {
    authInterrupts: true,
  },
  serverExternalPackages: ["@electric-sql/pglite", "drizzle-kit"],
};

export default nextConfig;
