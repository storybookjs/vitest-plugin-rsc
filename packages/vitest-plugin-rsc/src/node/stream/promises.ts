// `node:stream/promises`: `pipeline()` and `finished()` of the package's
// stream, as promises. unenv's throw.

import { promises } from "vitest-plugin-rsc/node/stream";

export const { pipeline, finished } = promises;
export default promises;
