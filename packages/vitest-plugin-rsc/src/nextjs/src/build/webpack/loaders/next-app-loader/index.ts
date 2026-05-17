import fs from "node:fs";
import path from "node:path";
import { createProjectRequire, normalizePath } from "../../../../../plugin-utils.ts";
import { virtualNextRouteEmptyModulePublicId } from "../../../../../virtual-ids.ts";
import type { NextAppLoaderOptions } from "../../../entries.ts";
import type { NextRouteManifestBuildEntry } from "../../../../server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";

type NextAppLoaderContext = {
  getOptions(): NextAppLoaderOptions;
  _module: { buildInfo: Record<string, unknown> };
  _compiler: { context: string };
  _compilation: undefined;
  addMissingDependency(file: string): void;
};

// Mirror/adapt: Next.js next-app-loader app-page output.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L48-L67
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L1060-L1119
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/app-page.ts#L103-L114
// Adaptation: Vite invokes the installed loader in-process, then extracts the
// app-page `tree` payload and rewrites webpack module references to Vite import
// sources while preserving the app-page export names consumed by the adapter.

// Begin adapted: Next.js next-app-loader invocation and app-page tree extraction
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L48-L67
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L1060-L1119
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/app-page.ts#L103-L114
// Adaptation: The loader still creates the tree, convention imports, and
// app-page template code. Vite strips the webpack runtime injections and keeps
// only the `tree` export plus lazy imports needed by the browser module graph.
export async function generateNextRouteTreeModule(
  root: string,
  entry: NextRouteManifestBuildEntry,
  loaderOptions: NextAppLoaderOptions,
) {
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
  return {
    code: extractNextLoaderTreeModule(generated),
    watchFiles: [...watchFiles],
    loaderOptions,
  };
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

function rewriteNextAppLoaderImports(code: string) {
  return code
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

export function extractRouteTreeImportSources(code: string) {
  return Array.from(
    code.matchAll(/\bimport\((?:\/\*[\s\S]*?\*\/\s*)?("([^"]+)"|'([^']+)')\)/g),
    (match) => match[2] ?? match[3] ?? "",
  ).filter(Boolean);
}

function toViteImportSource(source: string) {
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
