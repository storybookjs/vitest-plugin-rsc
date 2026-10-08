import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Next keys a cached function by this, when it is there, and not by the id
  // of the build.
  deploymentId: "cache-components-demo",
};

export default nextConfig;
