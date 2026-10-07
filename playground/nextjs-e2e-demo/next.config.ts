import type { NextConfig } from "next";
// A relative import on purpose. Next looks it up from the working directory,
// which is the repository root when the tests of this workspace run.
import { pageExtensions } from "./next.settings.ts";

const nextConfig: NextConfig = {
  pageExtensions,
  images: {
    // The other server that the tests have images on is the dev server itself.
    remotePatterns: [{ protocol: "http", hostname: "localhost", pathname: "/photos/**" }],
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
