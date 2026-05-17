import fs from "node:fs";
import path from "node:path";
import { createProjectRequire, normalizePath } from "../../../../../plugin-utils.ts";
import {
  virtualNextRouteEmptyModulePublicId,
  virtualNextServerActionEntryPublicId,
} from "../../../../../virtual-ids.ts";
import type { NextAppLoaderOptions, NextAppRouteLoaderOptions } from "../../../entries.ts";
import type { NextRouteManifestBuildEntry } from "../../../../server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";
import type { NextRouteHandlerManifestBuildEntry } from "../../../../server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts";

const publicVirtualCjsBrowserPrefix = "/@id/__x00__rsc:cjs-browser-esm:";

type NextAppLoaderContext = {
  getOptions(): NextAppLoaderOptions;
  _module: { buildInfo: Record<string, unknown> };
  _compiler: { context: string };
  _compilation: undefined;
  addMissingDependency(file: string): void;
};

// Direct Next artifact: Next.js next-app-loader app-page output.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L48-L67
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L1060-L1119
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/app-page.ts#L103-L114
// Note: `loadNextAppLoaderOutput` invokes the installed Next loader in-process
// and captures its generated app-page source. The helpers below do not copy the
// template; they preserve that generated artifact and only rewrite the webpack
// import/require boundary Vite cannot execute directly.

// Begin adapted: Vite boundary for generated Next app-page output
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L48-L67
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L1060-L1119
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/app-page.ts#L103-L114
// Adaptation: Keep Next-generated loader trees, convention imports, routeModule,
// and `__next_app__` shape intact while translating webpack's eager
// import/require surface to Vite static imports.
export async function generateNextRouteTreeModule(
  root: string,
  entry: NextRouteManifestBuildEntry,
  loaderOptions: NextAppLoaderOptions,
) {
  const { generated, watchFiles } = await loadNextAppLoaderOutput(root, entry, loaderOptions);
  return {
    code: extractNextLoaderTreeModule(generated),
    watchFiles: [...watchFiles],
    loaderOptions,
  };
}

export async function generateNextAppPageModule(
  root: string,
  entry: NextRouteManifestBuildEntry,
  loaderOptions: NextAppLoaderOptions,
) {
  const { generated, watchFiles } = await loadNextAppLoaderOutput(root, entry, loaderOptions);
  return {
    code: rewriteNextAppLoaderFullOutput(generated, { rootDir: loaderOptions.rootDir ?? root }),
    watchFiles: [...watchFiles],
    loaderOptions,
  };
}

export async function generateNextAppRouteModule(
  root: string,
  entry: NextRouteHandlerManifestBuildEntry,
  loaderOptions: NextAppRouteLoaderOptions,
) {
  const { generated, watchFiles } = await loadNextAppRouteLoaderOutput(root, entry, loaderOptions);
  return {
    code: rewriteNextAppLoaderImports(generated),
    watchFiles: [...watchFiles],
    loaderOptions,
  };
}

async function loadNextAppLoaderOutput(
  root: string,
  entry: NextRouteManifestBuildEntry,
  loaderOptions: NextAppLoaderOptions,
) {
  // Direct invocation: let installed Next produce the loader tree and app-page
  // template source before any Vite-specific rewriting happens.
  assertRootLayoutExists(entry, loaderOptions.pageExtensions);

  const requireFromProject = createProjectRequire(root);
  const watchFiles = new Set<string>([entry.pageFile]);
  const loader = requireFromProject("next/dist/build/webpack/loaders/next-app-loader/index.js") as {
    default: (this: NextAppLoaderContext) => Promise<string>;
  };
  const context: NextAppLoaderContext = {
    getOptions: () => loaderOptions,
    _module: { buildInfo: {} },
    _compiler: { context: root },
    _compilation: undefined,
    addMissingDependency(file) {
      watchFiles.add(file);
    },
  };

  const generated = await loader.default.call(context);
  return { generated, watchFiles };
}

async function loadNextAppRouteLoaderOutput(
  root: string,
  entry: NextRouteHandlerManifestBuildEntry,
  loaderOptions: NextAppRouteLoaderOptions,
) {
  // Direct invocation: let installed Next produce the app-route routeModule
  // source before the Edge App Route entry wraps it.
  const requireFromProject = createProjectRequire(root);
  const watchFiles = new Set<string>([entry.routeFile]);
  const loader = requireFromProject("next/dist/build/webpack/loaders/next-app-loader/index.js") as {
    default: (this: NextAppLoaderContext) => Promise<string>;
  };
  const appLoaderOptions = {
    ...loaderOptions,
    appPaths: [entry.appPath],
    allNormalizedAppPaths: [entry.route],
    assetPrefix: "",
    basePath: "",
    nextConfigOutput: (loaderOptions.nextConfigOutput ??
      null) as NextAppLoaderOptions["nextConfigOutput"],
    isGlobalNotFoundEnabled: undefined,
  } satisfies NextAppLoaderOptions;
  const context: NextAppLoaderContext = {
    getOptions: () => appLoaderOptions,
    _module: { buildInfo: {} },
    _compiler: { context: root },
    _compilation: undefined,
    addMissingDependency(file) {
      watchFiles.add(file);
    },
  };

  const generated = await loader.default.call(context);
  return { generated, watchFiles };
}

function assertRootLayoutExists(entry: NextRouteManifestBuildEntry, pageExtensions: string[]) {
  let currentDir = path.dirname(entry.pageFile);
  while (currentDir.startsWith(entry.appDir)) {
    if (findAppFile(currentDir, "layout", pageExtensions)) return;
    if (currentDir === entry.appDir) break;
    currentDir = path.dirname(currentDir);
  }

  throw new Error(
    `Cannot render Next route ${entry.route} because no root layout was found above ${entry.pageFile}. Add an app/layout file or render a React node directly.`,
  );
}

function findAppFile(dir: string, basename: string, pageExtensions: string[]) {
  return pageExtensions.find((extension) => {
    const extensionWithDot = extension.startsWith(".") ? extension : `.${extension}`;
    return fs.existsSync(path.join(dir, `${basename}${extensionWithDot}`));
  });
}

function extractNextLoaderTreeModule(generated: string) {
  const treeStart = generated.indexOf("const tree =");
  const treeEnd = generated.indexOf("const __next_app_require__", treeStart);
  if (treeStart < 0 || treeEnd < 0) {
    throw new Error("Could not extract loader tree from Next app loader output.");
  }

  const treeCode = generated
    .slice(treeStart, treeEnd)
    .replace("const tree =", "export const tree =");
  const referencedLoaders = new Set(
    Array.from(treeCode.matchAll(/\b([A-Za-z_$][\w$]*)\b/g), (match) => match[1]),
  );
  const moduleLoaders = generated
    .slice(0, treeStart)
    .split("\n")
    .filter((line) => {
      const match = line.match(/^const (\w+) = \(\) => import\(/);
      return match && referencedLoaders.has(match[1]!);
    })
    .join("\n");

  return rewriteNextAppLoaderImports(`${moduleLoaders}\n${treeCode}`);
}

export function rewriteNextAppLoaderFullOutput(
  generated: string,
  options: { rootDir?: string } = {},
) {
  const eagerImports: Array<{ id: string; namespace: string }> = [];
  const withStaticImports = generated.replace(
    /^const (\w+) = \(\) => import\(\/\* webpackMode: "eager" \*\/ (["'])([^'"]+)\2\);$/gm,
    (_match, loaderName: string, _quote: string, source: string) => {
      const namespace = `__next_app_import_${eagerImports.length}__`;
      eagerImports.push({ id: source, namespace });
      return [
        `const ${namespace} = await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__(` +
          `"client", ${JSON.stringify(source)});`,
        `const ${loaderName} = () => Promise.resolve(${namespace});`,
      ].join("\n");
    },
  );

  const requireRuntime = [
    "const __next_app_require_map__ = new Map([",
    ...eagerImports.map(({ id, namespace }) => `  [${JSON.stringify(id)}, ${namespace}],`),
    "]);",
    "const __next_app_import_fallback__ = (id, environmentName, importId = id) => {",
    "  const mod = globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__(environmentName, importId);",
    "  __next_app_require_map__.set(id, mod);",
    "  return mod;",
    "};",
    "const __next_app_normalize_require_id__ = (id) => {",
    '  if (typeof id !== "string") return id;',
    '  const hashIndex = id.indexOf("#");',
    "  return hashIndex === -1 ? id : id.slice(0, hashIndex);",
    "};",
    "const __next_app_require__ = (id) => {",
    "  const normalizedId = __next_app_normalize_require_id__(id);",
    "  const mod = __next_app_require_map__.get(id) ?? __next_app_require_map__.get(normalizedId);",
    "  if (mod) return mod;",
    "  const entryBaseClientReferenceMod =",
    "    __next_app_entry_base_client_reference_module_map__.get(id) ??",
    "    __next_app_entry_base_client_reference_module_map__.get(normalizedId);",
    "  if (entryBaseClientReferenceMod) return entryBaseClientReferenceMod;",
    `  if (typeof id === "string" && id.startsWith(${JSON.stringify(`${virtualNextServerActionEntryPublicId}?`)})) {`,
    '    return __next_app_import_fallback__(id, "client");',
    "  }",
    `  if (typeof id === "string" && id.startsWith(${JSON.stringify(publicVirtualCjsBrowserPrefix)})) {`,
    '    return __next_app_import_fallback__(id, "react_ssr");',
    "  }",
    '  if (typeof id === "string" && (id.startsWith("/@fs/") || id.startsWith("/@id/"))) {',
    '    return __next_app_import_fallback__(id, "react_ssr");',
    "  }",
    ...(options.rootDir
      ? [
          '  if (typeof id === "string" && id.startsWith("/") && !id.startsWith("/@")) {',
          `    return __next_app_import_fallback__(id, "react_ssr", ` +
            `${JSON.stringify(options.rootDir)} + normalizedId);`,
          "  }",
        ]
      : []),
    "  throw new Error(`Could not find Next app module ${String(id)} in Vite full app-page output.`);",
    "};",
  ].join("\n");

  const withViteRequire = withStaticImports.replace(
    "const __next_app_require__ = __webpack_require__",
    requireRuntime,
  );
  if (withViteRequire === withStaticImports) {
    throw new Error("Could not rewrite __next_app_require__ from Next app loader output.");
  }

  return rewriteNextAppLoaderImports(rewriteNextEntryBaseImport(withViteRequire, options));
}

function rewriteNextAppLoaderImports(code: string) {
  return rewriteNextEntryBaseExport(code)
    .replace(
      /import\((\/\*[\s\S]*?\*\/\s*)?(['"])([^'"]+)\2\)/g,
      (_match, comment: string | undefined, _quote: string, source: string) =>
        `import(${comment ?? ""}${JSON.stringify(toViteImportSource(source))})`,
    )
    .replace(
      /(from\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    )
    .replace(
      /(import\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    );
}

const nextEntryBaseExports = [
  "ClientPageRoot",
  "ClientSegmentRoot",
  "Fragment",
  "HTTPAccessFallbackBoundary",
  "InstantValidation",
  "LayoutRouter",
  "LoadingBoundaryProvider",
  "Postpone",
  "RenderFromTemplateContext",
  "RootLayoutBoundary",
  "SegmentViewNode",
  "SegmentViewStateNode",
  "actionAsyncStorage",
  "captureOwnerStack",
  "collectPrefetchHints",
  "collectSegmentData",
  "createElement",
  "createMetadataComponents",
  "createPrerenderParamsForClientSegment",
  "createPrerenderSearchParamsForClientPage",
  "createServerParamsForServerSegment",
  "createServerSearchParamsForServerPage",
  "createTemporaryReferenceSet",
  "decodeAction",
  "decodeFormState",
  "decodeReply",
  "patchFetch",
  "preconnect",
  "preloadFont",
  "preloadStyle",
  "prerender",
  "renderToReadableStream",
  "serverHooks",
  "taintObjectReference",
  "workAsyncStorage",
  "workUnitAsyncStorage",
] as const;

// Begin adapted: Next.js app-page entry-base client references
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/entry-base.ts
// Adaptation: Next's webpack server layer turns these transitive `"use client"`
// imports into client references while keeping the rest of entry-base in the
// server utility layer. Vite imports the server utility module through
// `react_ssr`, but keeps the client-reference ids on the original Next module
// ids so the browser decoder resolves executable modules through `react_client`.
const nextEntryBaseClientReferenceExports = [
  {
    name: "ClientPageRoot",
    importName: "ClientPageRoot",
    source: "next/dist/client/components/client-page.js",
  },
  {
    name: "ClientSegmentRoot",
    importName: "ClientSegmentRoot",
    source: "next/dist/client/components/client-segment.js",
  },
  {
    name: "HTTPAccessFallbackBoundary",
    importName: "HTTPAccessFallbackBoundary",
    source: "next/dist/client/components/http-access-fallback/error-boundary.js",
  },
  {
    name: "LayoutRouter",
    importName: "default",
    source: "next/dist/client/components/layout-router.js",
  },
  {
    name: "LoadingBoundaryProvider",
    importName: "LoadingBoundaryProvider",
    source: "next/dist/client/components/layout-router.js",
  },
  {
    name: "RenderFromTemplateContext",
    importName: "default",
    source: "next/dist/client/components/render-from-template-context.js",
  },
  {
    name: "RootLayoutBoundary",
    importName: "RootLayoutBoundary",
    source: "next/dist/lib/framework/boundary-components.js",
  },
  {
    name: "SegmentViewNode",
    importName: "SegmentViewNode",
    source: "next/dist/next-devtools/userspace/app/segment-explorer-node.js",
  },
  {
    name: "SegmentViewStateNode",
    importName: "SegmentViewStateNode",
    source: "next/dist/next-devtools/userspace/app/segment-explorer-node.js",
  },
] as const;
// End adapted

function createNextEntryBaseClientReferenceModuleMapCode() {
  const modules = new Map<string, string[]>();
  for (const { name, importName, source } of nextEntryBaseClientReferenceExports) {
    const exports = modules.get(source) ?? [];
    exports.push(`${JSON.stringify(importName)}: entryBase.${name}`);
    modules.set(source, exports);
  }

  return [
    "const __next_app_entry_base_client_reference_module_map__ = new Map([",
    ...Array.from(
      modules,
      ([source, exports]) => `  [${JSON.stringify(source)}, { ${exports.join(", ")} }],`,
    ),
    "]);",
  ].join("\n");
}

function rewriteNextEntryBaseExport(code: string) {
  return code.replace(
    /export\s+\*\s+from\s+["']next\/dist\/server\/app-render\/entry-base(?:\.js)?["'](?:\s+(?:with|assert)\s+\{[\s\S]*?\})?\s*;?/g,
    nextEntryBaseExports.map((name) => `export const ${name} = entryBase.${name};`).join("\n"),
  );
}

function rewriteNextEntryBaseImport(code: string, options: { rootDir?: string } = {}) {
  const clientReferenceOverrides = nextEntryBaseClientReferenceExports.map(
    ({ name, importName, source }) =>
      `  ${name}: __next_app_entry_base_client_reference__(${JSON.stringify(
        createNextClientReferencePublicId(source, options.rootDir),
      )}, ${JSON.stringify(importName)}, __next_app_entry_base_server__.${name}),`,
  );

  const replacement = [
    'const __next_app_entry_base_server_module__ = await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__("react_ssr", "next/dist/server/app-render/entry-base.js");',
    "const __next_app_entry_base_server__ = __next_app_entry_base_server_module__.default ?? __next_app_entry_base_server_module__;",
    "// Begin adapted: React Server DOM client reference shape",
    "// Source: https://github.com/facebook/react/blob/d5736f098edee62c44f27b053e6e48f5fa443803/packages/react-server-dom-webpack/src/ReactFlightWebpackReferences.js#L49-L57",
    "// Adaptation: materialize Next entry-base client references inside the react_ssr module realm so Next's RSC renderer can read the non-enumerable client-reference fields.",
    'const __next_app_entry_base_client_reference_tag__ = Symbol.for("react.client.reference");',
    "const __next_app_entry_base_client_reference__ = (id, name, implementation) =>",
    "  Object.defineProperties(",
    '    typeof implementation === "function" ? implementation : function() {',
    '      throw new Error("Unexpectedly client reference export \'" + name + "\' from " + id + " is called on server");',
    "    },",
    "    {",
    "      $$typeof: { value: __next_app_entry_base_client_reference_tag__ },",
    '      $$id: { value: id + "#" + name },',
    "      $$async: { value: false },",
    "    },",
    "  );",
    "// End adapted",
    "const entryBase = {",
    "  ...__next_app_entry_base_server__,",
    ...clientReferenceOverrides,
    "};",
    createNextEntryBaseClientReferenceModuleMapCode(),
  ].join("\n");

  return code.replace(
    /import\s+\*\s+as\s+entryBase\s+from\s+["']next\/dist\/server\/app-render\/entry-base(?:\.js)?["'](?:\s+with\s+\{[\s\S]*?\})?;?/,
    () => replacement,
  );
}

function createNextClientReferencePublicId(source: string, _rootDir?: string) {
  return source;
}

export function extractRouteTreeImportSources(code: string) {
  return Array.from(
    code.matchAll(/\bimport\((?:\/\*[\s\S]*?\*\/\s*)?("([^"]+)"|'([^']+)')\)/g),
    (match) => match[2] ?? match[3] ?? "",
  ).filter(Boolean);
}

function toViteImportSource(source: string) {
  if (
    source === "next/dist/server/route-modules/app-page/module.compiled" ||
    source === "next/dist/server/route-modules/app-page/module.compiled.js"
  ) {
    return "next/dist/server/route-modules/app-page/module.js";
  }
  if (!path.isAbsolute(source)) return source;
  const [file] = source.split("?");
  if (file && !fs.existsSync(file)) return virtualNextRouteEmptyModulePublicId;

  return `/@fs/${normalizePath(source).replace(/^\//, "")}`;
}

export function toOptimizerImportSource(source: string) {
  if (!source.startsWith("/@fs/")) return source;
  return `/${source.slice("/@fs/".length)}`;
}
// End adapted
