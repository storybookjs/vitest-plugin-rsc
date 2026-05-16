import { createProjectRequire } from "../../../../../../plugin-utils.ts";

// Mirror/adapt: Next.js dev route matcher file reader setup.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts#L1-L53
// Adaptation: Vitest imports Next's installed DefaultFileReader directly, but
// centralizes the ignorePartFilter used by the app page and app route providers
// because there is no Next dev route matcher manager in this runtime.

// Begin adapted: Next.js DefaultFileReader construction
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts#L14-L52
// Adaptation: Use the installed reader and preserve the app-dir scan filter
// needed by the Vite project boundary.
export function createNextDevDefaultFileReader(root: string) {
  const { DefaultFileReader } = createProjectRequire(root)(
    "next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js");

  return new DefaultFileReader({
    ignorePartFilter: (part: string) => part === "node_modules" || part.startsWith("."),
  });
}
// End adapted
