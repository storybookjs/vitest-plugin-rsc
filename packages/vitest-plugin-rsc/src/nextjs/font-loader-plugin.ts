import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { createProjectRequire, getProjectRoot } from "./plugin-utils";

const virtualNextFontPrefix = "virtual:vitest-plugin-rsc/next-font/";

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
  emitFontFile(buffer: Buffer, ext: string): string;
  resolve(path: string): Promise<string>;
  isDev: boolean;
  isServer: boolean;
  loaderContext: {
    fs: typeof fs;
  };
}) => Promise<NextFontLoaderResult>;

export function useNextFontLoader(): Plugin {
  let root = process.cwd();

  return {
    name: "next-rsc-font-loader",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
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
      const loaderModule = projectRequire(
        request.kind === "google"
          ? "next/dist/compiled/@next/font/dist/google/loader.js"
          : "next/dist/compiled/@next/font/dist/local/loader.js",
      ) as { default?: NextFontLoader } | NextFontLoader;
      const loader = typeof loaderModule === "function" ? loaderModule : loaderModule.default;

      if (!loader) {
        throw new Error(`Could not load Next ${request.kind} font loader`);
      }

      const result = await loader({
        functionName: request.functionName,
        variableName: request.variableName,
        data: request.data,
        emitFontFile(buffer, ext) {
          return `data:${getFontMimeType(ext)};base64,${Buffer.from(buffer).toString("base64")}`;
        },
        async resolve(source) {
          return path.resolve(path.dirname(request.importer), source);
        },
        isDev: true,
        isServer: false,
        loaderContext: { fs },
      });

      const cssModule = await createFontCssModule(projectRequire, result, request.data);
      return cssModule;
    },
  };
}

function createVirtualFontId(request: FontRequest) {
  return `${virtualNextFontPrefix}${Buffer.from(JSON.stringify(request)).toString("base64url")}`;
}

function parseFontRequest(id: string): FontRequest {
  const encoded = id.slice(virtualNextFontPrefix.length);
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FontRequest;
}

async function createFontCssModule(
  projectRequire: ReturnType<typeof createProjectRequire>,
  result: NextFontLoaderResult,
  data: unknown[],
) {
  const postcss = projectRequire("postcss") as (plugins: unknown[]) => {
    process(css: string, options: { from?: string }): Promise<{ css: string }>;
  };
  const postcssNextFontModule = projectRequire(
    "next/dist/build/webpack/loaders/next-font-loader/postcss-next-font.js",
  ) as { default?: (options: unknown) => unknown } | ((options: unknown) => unknown);
  const postcssNextFont =
    typeof postcssNextFontModule === "function"
      ? postcssNextFontModule
      : postcssNextFontModule.default;
  const loaderUtils = projectRequire("next/dist/compiled/loader-utils3") as {
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
  const css = processed.css
    .replaceAll(".className", `.${className}`)
    .replaceAll(".variable", `.${variableClassName}`);
  const styleHash = loaderUtils.getHashDigest(Buffer.from(css), "sha1", "hex", 6);
  const style = fontExports.find((fontExport) => fontExport.name === "style")?.value ?? {};

  return `
const css = ${JSON.stringify(css)};
const id = ${JSON.stringify(`vitest-plugin-rsc-next-font-${styleHash}`)};
const fontStyles = globalThis[Symbol.for("vitest-plugin-rsc.nextjs.fontStyles")] ??= new Map();
fontStyles.set(id, css);
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
