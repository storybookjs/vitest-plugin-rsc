import type { Plugin } from "vite";
import { tryResolveFromProject } from "../../../plugin-utils.ts";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/shared/lib/server-reference-info.ts#L1-L76
// Adaptation: Next's reducer uses this helper to omit unused action arguments
// from hex-encoded action IDs. Vite RSC action IDs are module references, not
// Next hex IDs, so this virtual helper delegates real hex IDs to Next and
// treats Vite IDs as using all arguments.
// Begin adapted: Next.js server-reference-info bridge
const virtualServerReferenceInfoId = "\0vitest-plugin-rsc:next-server-reference-info";

export function useVitestServerReferenceInfo(root = process.cwd()): Plugin {
  const original = tryResolveFromProject(root, "next/dist/shared/lib/server-reference-info.js");

  return {
    name: "next-rsc-server-reference-info",
    enforce: "pre",
    async resolveId(source, importer) {
      if (
        source !== "next/dist/shared/lib/server-reference-info.js" &&
        source !== "next/dist/shared/lib/server-reference-info" &&
        !(source.endsWith("/shared/lib/server-reference-info") && importer?.includes("/next/dist/"))
      ) {
        return;
      }

      return virtualServerReferenceInfoId;
    },
    load(id) {
      if (id !== virtualServerReferenceInfoId) return;
      if (!original) {
        throw new Error("Could not resolve next/dist/shared/lib/server-reference-info.js");
      }

      return `
import {
  extractInfoFromServerReferenceId as extractNextInfoFromServerReferenceId,
  omitUnusedArgs,
} from ${JSON.stringify(original)};

export { omitUnusedArgs };

export function extractInfoFromServerReferenceId(id) {
  const isNextActionId = id.length > 0 && !id.includes("#") && /^[0-9a-fA-F]+$/.test(id);
  return isNextActionId
    ? extractNextInfoFromServerReferenceId(id)
    : {
        type: "server-action",
        usedArgs: [true, true, true, true, true, true],
        hasRestArgs: true,
      };
}
`;
    },
  };
}
// End adapted
