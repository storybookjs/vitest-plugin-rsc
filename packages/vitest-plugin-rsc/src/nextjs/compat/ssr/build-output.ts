// What build-output.ts, in the ssr layer, takes of Next for the files of a
// build that Next's server reads.

export type { PrerenderManifest } from "next/dist/build";
export { RSC_SUFFIX } from "next/dist/lib/constants";
export { normalizePagePath } from "next/dist/shared/lib/page-path/normalize-page-path";
