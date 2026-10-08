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
  // What the server does before it looks for a route: app/routing.test.tsx.
  async redirects() {
    return [{ source: "/guide/:slug", destination: "/docs/:slug", permanent: true }];
  },
  async rewrites() {
    return {
      // Before a route is looked for: also at a URL that a page has.
      beforeFiles: [{ source: "/docs/start", destination: "/docs/getting-started" }],
      // After the routes with a fixed path, and before the dynamic ones.
      afterFiles: [
        { source: "/docs", destination: "/help" },
        { source: "/docs/echo", destination: "/api/echo/docs" },
      ],
      // For a URL that no route has.
      fallback: [
        { source: "/docs/:slug/:rest+", destination: "/docs/:slug" },
        // Another server. Its origin comes with the request, for the tests:
        // they do not know the port of theirs up front.
        {
          source: "/elsewhere/:path*",
          has: [{ type: "header", key: "x-elsewhere", value: "(?<origin>.*)" }],
          destination: "http://:origin/:path*",
        },
      ],
    };
  },
  async headers() {
    return [
      { source: "/docs/:slug", headers: [{ key: "x-docs", value: ":slug" }] },
      { source: "/api/plain", headers: [{ key: "x-served-by", value: "next.config" }] },
    ];
  },
};

export default nextConfig;
