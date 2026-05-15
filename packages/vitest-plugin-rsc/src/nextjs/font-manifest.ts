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
