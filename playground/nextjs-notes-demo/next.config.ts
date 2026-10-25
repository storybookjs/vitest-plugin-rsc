import "./env/server.ts";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactCompiler: true,
  // `forbidden()`, for app/admin.
  experimental: { authInterrupts: true },
};

export default nextConfig;
