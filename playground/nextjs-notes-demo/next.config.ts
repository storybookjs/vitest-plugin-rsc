import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactCompiler: true,
  async rewrites() {
    return [
      { source: "/next-config-rewrite", destination: "/next-apis" },
      {
        source: "/next-apis",
        destination: "/route-patterns/conventions?from=after-files-shadow",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/next-config-redirect",
        destination: "/next-apis?from=config-redirect",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/next-apis",
        headers: [{ key: "x-next-config-header", value: "notes-demo" }],
      },
    ];
  },
  cacheComponents: true,
  cacheLife: {
    "notes-demo-fast": {
      stale: 1,
      revalidate: 1,
      expire: 60,
    },
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
