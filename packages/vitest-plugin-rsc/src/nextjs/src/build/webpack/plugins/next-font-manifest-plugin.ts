// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/plugins/next-font-manifest-plugin.ts#L7-L16
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/plugins/next-font-manifest-plugin.ts#L71-L111
// Adaptation: Vite does not run NextFontManifestPlugin. The font loader bridge
// records the same manifest shape in memory so app-render and preload helpers
// can consume Next-compatible font metadata.
// Begin adapted: Next.js next-font-manifest-plugin output shape
const nextFontManifestSymbol = Symbol.for("vitest-plugin-rsc.nextjs.fontManifest");

export type NextFontManifest = {
  pages: Record<string, string[]>;
  app: Record<string, string[]>;
  appUsingSizeAdjust: boolean;
  pagesUsingSizeAdjust: boolean;
};

export function recordNextFontManifestEntry(
  keys: Iterable<string>,
  options: { fontFile: string; preload: boolean; isUsingSizeAdjust: boolean },
) {
  const manifest = getMutableNextFontManifest();
  manifest.appUsingSizeAdjust ||= options.isUsingSizeAdjust;

  for (const key of keys) {
    const fontFiles = (manifest.app[key] ??= []);
    if (options.preload && !fontFiles.includes(options.fontFile)) {
      fontFiles.push(options.fontFile);
    }
  }
}

export function getNextFontManifestForRender(): NextFontManifest {
  return getMutableNextFontManifest();
}

function getMutableNextFontManifest(): NextFontManifest {
  const globalScope = globalThis as typeof globalThis & Record<symbol, NextFontManifest>;
  return (globalScope[nextFontManifestSymbol] ??= {
    pages: {},
    app: {},
    appUsingSizeAdjust: false,
    pagesUsingSizeAdjust: false,
  });
}
// End adapted
