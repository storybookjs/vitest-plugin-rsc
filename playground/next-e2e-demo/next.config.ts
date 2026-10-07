import type { NextConfig } from "next";
// A relative import on purpose. Next looks it up from the working directory,
// which is the repository root when the tests of this workspace run.
import { pageExtensions } from "./next.settings.ts";

// SPIKE (research/use-cache-spike): `SPIKE_CC=1` turns on Cache Components for
// the whole app. Without it only the `"use cache"` directive is on.
// oxlint-disable-next-line no-process-env
const cacheComponents = process.env.SPIKE_CC === "1";

const nextConfig: NextConfig = {
  pageExtensions,
  ...(cacheComponents ? { cacheComponents: true } : { experimental: { useCache: true } }),
};

export default nextConfig;
