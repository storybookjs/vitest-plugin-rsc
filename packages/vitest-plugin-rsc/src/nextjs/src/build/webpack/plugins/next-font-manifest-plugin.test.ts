import { expect, test } from "vitest";
import {
  getNextFontManifestForRender,
  recordNextFontManifestEntry,
} from "./next-font-manifest-plugin.ts";

test("records Next font manifest app entries", () => {
  delete (globalThis as Record<symbol, unknown>)[
    Symbol.for("vitest-plugin-rsc.nextjs.fontManifest")
  ];

  recordNextFontManifestEntry(["app/layout", "app/page"], {
    fontFile: "static/media/inter.p.woff2",
    preload: true,
    isUsingSizeAdjust: true,
  });
  recordNextFontManifestEntry(["app/page"], {
    fontFile: "static/media/local.woff2",
    preload: false,
    isUsingSizeAdjust: false,
  });

  expect(getNextFontManifestForRender()).toEqual({
    pages: {},
    app: {
      "app/layout": ["static/media/inter.p.woff2"],
      "app/page": ["static/media/inter.p.woff2"],
    },
    appUsingSizeAdjust: true,
    pagesUsingSizeAdjust: false,
  });
});
