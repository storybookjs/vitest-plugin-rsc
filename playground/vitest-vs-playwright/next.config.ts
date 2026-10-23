import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The types are `pnpm tsgo`'s, which knows the plugin's from its source: the
  // Playwright job of the workflow does not build the plugin, and `next build`
  // checks the Vitest tests too.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
