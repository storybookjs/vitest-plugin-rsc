import type { Plugin } from "vite";

const virtualNextImageClientReferenceId = "virtual:vitest-plugin-rsc/next-image-client-reference";

export function useNextImageClientReference(): Plugin {
  return {
    name: "next-rsc-image-client-reference",
    enforce: "pre",
    resolveId(source) {
      if (source === "next/image" || source === "next/image.js") {
        return virtualNextImageClientReferenceId;
      }

      if (source === virtualNextImageClientReferenceId) {
        return source;
      }
    },
    load(id) {
      if (id !== virtualNextImageClientReferenceId) return;

      return `"use client";
export { Image as default, Image } from "next/dist/client/image-component.js";
export { getImageProps } from "next/dist/shared/lib/image-external.js";
`;
    },
  };
}
