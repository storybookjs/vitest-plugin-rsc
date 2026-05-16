import { getPreloadableFonts } from "next/dist/server/app-render/get-preloadable-fonts.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { encodeURIPath } from "next/dist/shared/lib/encode-uri-path.js";
import { getNextFontManifestForRender } from "../../build/webpack/plugins/next-font-manifest-plugin.ts";
import { collectLoaderTreeFilePaths } from "../lib/app-dir-module.ts";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/get-layer-assets.tsx#L1-L79
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/get-preloadable-fonts.tsx#L1-L38
// Adaptation: Next emits font preload callbacks while building layer assets.
// Vitest has already produced document HTML, so this mirrors the same
// nextFontManifest lookup and injects preload links into the active document.
// Begin adapted: Next.js app-render font layer asset preloads
export function injectNextFontPreloadLinks(loaderTree: LoaderTree) {
  const manifest = getNextFontManifestForRender();
  const injectedFontPreloadTags = new Set<string>();

  for (const filePath of collectLoaderTreeFilePaths(loaderTree)) {
    const preloadedFonts = getPreloadableFonts(manifest, filePath, injectedFontPreloadTags);
    if (!preloadedFonts?.length) continue;

    for (const fontFile of preloadedFonts) {
      const href = `${readNextAssetPrefix()}/_next/${encodeURIPath(fontFile)}`;
      if (document.head.querySelector(`link[rel="preload"][as="font"][href="${href}"]`)) {
        continue;
      }

      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "font";
      link.href = href;
      link.type = getFontPreloadType(fontFile);
      document.head.appendChild(link);
    }
  }
}
// End adapted

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-font-loader/postcss-next-font.ts#L21-L194
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/plugins/next-font-manifest-plugin.ts#L71-L111
// Adaptation: the Vite font loader stores emitted CSS in-memory instead of
// Next's webpack CSS pipeline. Component tests inject those styles into the
// current document after render.
// Begin adapted: Next.js next/font emitted CSS document injection
export function injectNextFontStyles() {
  const fontStyles = (globalThis as typeof globalThis & Record<symbol, Map<string, string>>)[
    Symbol.for("vitest-plugin-rsc.nextjs.fontStyles")
  ];
  if (!fontStyles) return;

  for (const [id, css] of fontStyles) {
    if (document.getElementById(id)) continue;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
}
// End adapted

function readNextAssetPrefix() {
  return typeof process.env.__NEXT_ASSET_PREFIX === "string" ? process.env.__NEXT_ASSET_PREFIX : "";
}

function getFontPreloadType(fontFile: string) {
  const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile)?.[1];
  return ext ? `font/${ext}` : "";
}
