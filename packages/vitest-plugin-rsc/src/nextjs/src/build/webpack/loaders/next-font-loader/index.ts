import { Buffer } from "node:buffer";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { loadNextProjectConfig } from "../../../../../config.ts";
import {
  createProjectRequire,
  getProjectRoot,
  normalizePath,
} from "../../../../../plugin-utils.ts";

// Mirror/adapt: Next.js next-font-loader.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-font-loader/index.ts#L9-L166
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-font-loader/postcss-next-font.ts#L21-L194
// Adaptation: Vite resolves the SWC-generated next/font target CSS import to a
// virtual module, calls Next's installed font loader and postcss transform, and
// translates webpack asset emission to Vite dev middleware or Rollup assets.

// Begin adapted: Next.js next-font-loader virtual module bridge
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-font-loader/index.ts#L9-L166
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-font-loader/postcss-next-font.ts#L21-L194
// Adaptation: Preserve Next font loader inputs, generated CSS module classes,
// and manifest side effects while replacing webpack loader context APIs.
const virtualNextFontPrefix = "virtual:vitest-plugin-rsc/next-font/";
const fontAssetPlaceholderPrefix = "__vitest_plugin_rsc_next_font_asset__";

type FontKind = "google" | "local";

type FontRequest = {
  kind: FontKind;
  functionName: string;
  variableName: string;
  data: unknown[];
  importer: string;
};

type NextFontLoaderResult = {
  css: string;
  fallbackFonts?: string[];
  adjustFontFallback?: {
    fallbackFont: string;
    ascentOverride?: string;
    descentOverride?: string;
    lineGapOverride?: string;
    sizeAdjust?: string;
  };
  weight?: string;
  style?: string;
  variable?: string;
};

type NextFontLoader = (options: {
  functionName: string;
  variableName: string;
  data: unknown[];
  emitFontFile(buffer: Buffer, ext: string, preload?: boolean, isUsingSizeAdjust?: boolean): string;
  resolve(path: string): Promise<string>;
  isDev: boolean;
  isServer: boolean;
  loaderContext: {
    fs: typeof fs;
  };
}) => Promise<NextFontLoaderResult>;

export function useNextFontLoader(): Plugin {
  let root = process.cwd();
  let mode = "test";
  let command: ResolvedConfig["command"] = "serve";
  const devFontAssets = new Map<string, { contentType: string; source: Buffer }>();

  return {
    name: "next-rsc-font-loader",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      command = config.command;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const asset = devFontAssets.get(new URL(req.url, "http://localhost").pathname);
        if (!asset) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", asset.contentType);
        res.end(asset.source);
      });
    },
    resolveId(source) {
      if (source.startsWith(virtualNextFontPrefix)) {
        return source;
      }

      const request = createFontRequestFromNextTargetCss(source, root);
      if (request) {
        return createVirtualFontId(request);
      }
    },
    async load(id) {
      if (!id.startsWith(virtualNextFontPrefix)) return;

      const request = parseFontRequest(id);
      const projectRequire = createProjectRequire(root);
      const nextRequire = createNextRequire(projectRequire);
      const projectConfig = await loadNextProjectConfig(root, mode);
      const loaderUtils = nextRequire("next/dist/compiled/loader-utils3") as {
        interpolateName(
          context: unknown,
          name: string,
          options: { context: string; content: Buffer },
        ): string;
        getHashDigest(
          buffer: Buffer,
          hashType: string,
          digestType: string,
          maxLength: number,
        ): string;
      };
      const loaderModule = nextRequire(
        request.kind === "google"
          ? "next/dist/compiled/@next/font/dist/google/loader.js"
          : "next/dist/compiled/@next/font/dist/local/loader.js",
      ) as { default?: NextFontLoader } | NextFontLoader;
      const loader = typeof loaderModule === "function" ? loaderModule : loaderModule.default;

      if (!loader) {
        throw new Error(`Could not load Next ${request.kind} font loader`);
      }

      const emitAsset = this.emitFile?.bind(this);
      const addWatchFile = this.addWatchFile?.bind(this) ?? (() => {});
      const emittedAssets = new Map<string, string>();
      const manifestFiles: Array<{
        fontFile: string;
        preload: boolean;
        isUsingSizeAdjust: boolean;
      }> = [];
      const result = await loader({
        functionName: request.functionName,
        variableName: request.variableName,
        data: request.data,
        emitFontFile: (buffer, ext, preload = false, isUsingSizeAdjust = false) => {
          const source = Buffer.from(buffer);
          const interpolatedName = loaderUtils.interpolateName(
            {
              resourcePath: request.importer,
              rootContext: root,
            },
            `static/media/[hash]${isUsingSizeAdjust ? "-s" : ""}${preload ? ".p" : ""}.${ext}`,
            { context: root, content: source },
          );
          const nextUrl = `${projectConfig.assetPrefix}/_next/${interpolatedName}`;
          manifestFiles.push({
            fontFile: interpolatedName,
            preload,
            isUsingSizeAdjust,
          });

          if (command === "build") {
            if (!emitAsset) {
              throw new Error("Next font build asset emission requires Vite emitFile.");
            }
            const referenceId = emitAsset({
              type: "asset",
              fileName: path.posix.join("_next", interpolatedName),
              source,
            });
            const placeholder = `${fontAssetPlaceholderPrefix}${referenceId}__`;
            emittedAssets.set(placeholder, referenceId);
            return placeholder;
          }

          devFontAssets.set(new URL(nextUrl, "http://localhost").pathname, {
            contentType: getFontMimeType(ext),
            source,
          });
          return nextUrl;
        },
        async resolve(source) {
          const resolved = path.resolve(path.dirname(request.importer), source);
          addWatchFile(resolved);
          return resolved;
        },
        isDev: command !== "build",
        isServer: false,
        loaderContext: { fs },
      });

      const cssModule = await createFontCssModule(
        nextRequire,
        result,
        request.data,
        [...getNextFontManifestKeys(root, request.importer)],
        manifestFiles,
        emittedAssets,
      );
      return cssModule;
    },
  };
}

function createNextRequire(projectRequire: NodeJS.Require): NodeJS.Require {
  return createRequire(projectRequire.resolve("next/package.json"));
}

function createVirtualFontId(request: FontRequest) {
  return `${virtualNextFontPrefix}${Buffer.from(JSON.stringify(request)).toString("base64url")}`;
}

function parseFontRequest(id: string): FontRequest {
  const encoded = id.slice(virtualNextFontPrefix.length);
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FontRequest;
}

async function createFontCssModule(
  nextRequire: NodeJS.Require,
  result: NextFontLoaderResult,
  data: unknown[],
  manifestKeys: string[],
  manifestFiles: Array<{ fontFile: string; preload: boolean; isUsingSizeAdjust: boolean }>,
  emittedAssets = new Map<string, string>(),
) {
  const postcss = nextRequire("postcss") as (plugins: unknown[]) => {
    process(
      css: string,
      options: { from?: string },
    ): Promise<{
      css: string;
      root?: {
        walkRules(callback: (rule: { selector: string }) => void): void;
        toString(): string;
      };
    }>;
  };
  const postcssNextFontModule = nextRequire(
    "next/dist/build/webpack/loaders/next-font-loader/postcss-next-font.js",
  ) as { default?: (options: unknown) => unknown } | ((options: unknown) => unknown);
  const postcssNextFont =
    typeof postcssNextFontModule === "function"
      ? postcssNextFontModule
      : postcssNextFontModule.default;
  const loaderUtils = nextRequire("next/dist/compiled/loader-utils3") as {
    getHashDigest(buffer: Buffer, hashType: string, digestType: string, maxLength: number): string;
  };

  if (!postcssNextFont) {
    throw new Error("Could not load Next font postcss transform");
  }

  const fontExports: Array<{ name: string; value: unknown }> = [];
  const fontFamilyHash = loaderUtils.getHashDigest(Buffer.from(result.css), "sha1", "hex", 6);
  const variable = result.variable ?? getFontOption(data, "variable");
  const processed = await postcss([
    postcssNextFont({
      exports: fontExports,
      fallbackFonts: result.fallbackFonts,
      weight: result.weight,
      style: result.style,
      adjustFontFallback: result.adjustFontFallback,
      variable,
    }),
  ]).process(result.css, { from: undefined });
  const className = `__className_${fontFamilyHash}`;
  const variableClassName = variable ? `__variable_${fontFamilyHash}` : "";
  const css = renameFontCssModuleSelectors(processed, className, variableClassName);
  const styleHash = loaderUtils.getHashDigest(Buffer.from(css), "sha1", "hex", 6);
  const style = fontExports.find((fontExport) => fontExport.name === "style")?.value ?? {};

  return `
const css = ${createCssExpression(css, emittedAssets)};
const id = ${JSON.stringify(`vitest-plugin-rsc-next-font-${styleHash}`)};
const fontStyles = globalThis[Symbol.for("vitest-plugin-rsc.nextjs.fontStyles")] ??= new Map();
fontStyles.set(id, css);
const fontManifest = globalThis[Symbol.for("vitest-plugin-rsc.nextjs.fontManifest")] ??= {
  pages: {},
  app: {},
  appUsingSizeAdjust: false,
  pagesUsingSizeAdjust: false,
};
fontManifest.appUsingSizeAdjust ||= ${JSON.stringify(
    manifestFiles.some((file) => file.isUsingSizeAdjust),
  )};
for (const key of ${JSON.stringify(manifestKeys)}) {
  const fontFiles = fontManifest.app[key] ??= [];
  for (const file of ${JSON.stringify(
    manifestFiles.filter((file) => file.preload).map((file) => file.fontFile),
  )}) {
    if (!fontFiles.includes(file)) fontFiles.push(file);
  }
}
if (typeof document !== "undefined" && !document.getElementById(id)) {
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
const font = {
  className: ${JSON.stringify(className)},
  variable: ${JSON.stringify(variableClassName)},
  style: ${JSON.stringify(style)},
};
export default font;
`;
}

function renameFontCssModuleSelectors(
  processed: {
    css: string;
    root?: {
      walkRules(callback: (rule: { selector: string }) => void): void;
      toString(): string;
    };
  },
  className: string,
  variableClassName: string,
) {
  if (!processed.root) return processed.css;

  processed.root.walkRules((rule) => {
    if (rule.selector === ".className") {
      rule.selector = `.${className}`;
    } else if (rule.selector === ".variable") {
      rule.selector = `.${variableClassName}`;
    }
  });

  return processed.root.toString();
}

function createCssExpression(css: string, emittedAssets: Map<string, string>) {
  if (emittedAssets.size === 0) return JSON.stringify(css);

  const parts: string[] = [];
  let cursor = 0;

  while (cursor < css.length) {
    let nextReplacement: { index: number; placeholder: string; referenceId: string } | undefined;
    for (const [placeholder, referenceId] of emittedAssets) {
      const index = css.indexOf(placeholder, cursor);
      if (index === -1) continue;
      if (!nextReplacement || index < nextReplacement.index) {
        nextReplacement = { index, placeholder, referenceId };
      }
    }

    if (!nextReplacement) {
      parts.push(JSON.stringify(css.slice(cursor)));
      break;
    }

    if (nextReplacement.index > cursor) {
      parts.push(JSON.stringify(css.slice(cursor, nextReplacement.index)));
    }
    parts.push(`import.meta.ROLLUP_FILE_URL_${nextReplacement.referenceId}`);
    cursor = nextReplacement.index + nextReplacement.placeholder.length;
  }

  return parts.length > 0 ? parts.join(" + ") : JSON.stringify(css);
}

function createFontRequestFromNextTargetCss(source: string, root: string): FontRequest | undefined {
  const match = /^next\/font\/(google|local)\/target\.css\?(.+)$/.exec(source);
  if (!match) return;

  const kind = match[1] as FontKind;
  const query = JSON.parse(match[2]!) as {
    path?: string;
    import?: string;
    arguments?: unknown[];
    variableName?: string;
  };
  const issuer = query.path ? path.resolve(root, query.path) : root;
  const functionName = query.import ?? "";
  const variableName = query.variableName ?? functionName;
  if (!variableName) {
    throw new Error(`Invalid Next font target CSS import: ${source}`);
  }

  return {
    kind,
    functionName,
    variableName,
    data: query.arguments ?? [],
    importer: issuer,
  };
}

function getFontMimeType(ext: string) {
  switch (ext) {
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    default:
      return "application/octet-stream";
  }
}

function getFontOption(data: unknown[], key: string) {
  const options = data[0];
  if (!options || typeof options !== "object" || Array.isArray(options)) return;

  const value = (options as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getNextFontManifestKeys(root: string, importer: string) {
  const keys = new Set<string>();
  const withoutExtension = stripExtension(importer);
  const normalizedFile = normalizePath(withoutExtension);
  keys.add(normalizedFile);
  keys.add(`/@fs/${normalizedFile.replace(/^\//, "")}`);

  const relative = normalizePath(path.relative(root, withoutExtension));
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    keys.add(relative);
    keys.add(`/${relative}`);
    if (relative.startsWith("app/")) {
      keys.add(`private-next-app-dir/${relative.slice("app/".length)}`);
    }
  }

  return keys;
}

function stripExtension(file: string) {
  return file.replace(/\.[^./\\]+$/, "");
}
// End adapted
