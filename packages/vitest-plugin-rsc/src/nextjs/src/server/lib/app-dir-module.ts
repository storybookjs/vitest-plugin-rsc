import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { PAGE_SEGMENT_KEY } from "next/dist/shared/lib/segment.js";
import { createElement, type JSXElementConstructor, type ReactNode } from "react";

export type LoaderTreeModule = [loader: () => Promise<Record<string, unknown>>, filePath: string];

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/lib/app-dir-module.ts#L4-L29
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L452-L496
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/shared/lib/segment.ts#L70-L72
// Adaptation: direct ReactNode renders synthesize a private app route so the
// rest of the render can go through Next app-render; wrapper/fallback traversal
// updates the same LoaderTree tuple shape without invoking next-app-loader.
// Begin adapted: Next.js LoaderTree tuple shape and app-loader page subtree shape
export function createDirectNodeLoaderTree({
  routePattern,
  node,
  pageFile,
}: {
  routePattern: string;
  node: ReactNode;
  pageFile: string;
}): LoaderTree {
  function VitestDirectPage() {
    return node;
  }

  function VitestDirectRootLayout({ children }: { children: ReactNode }) {
    return children;
  }

  const pageModule: LoaderTreeModule = [async () => ({ default: VitestDirectPage }), pageFile];
  const rootLayoutModule: LoaderTreeModule = [
    async () => ({ default: VitestDirectRootLayout }),
    "vitest-plugin-rsc/direct-layout",
  ];

  return createLoaderTree(routePattern, pageModule, rootLayoutModule);
}

export function wrapRootLayoutLoaderTree(
  loaderTree: LoaderTree,
  Wrapper: JSXElementConstructor<{ children: ReactNode }>,
): LoaderTree {
  const [segment, parallelRoutes, modules, metadata] = loaderTree;
  const layout = modules.layout;
  if (!layout) return loaderTree;

  const wrappedLayout: LoaderTreeModule = [
    async () => {
      const mod = await layout[0]();
      const RootLayout = mod.default as JSXElementConstructor<{ children: ReactNode }>;

      return {
        ...mod,
        default(props: { children: ReactNode }) {
          return createElement(Wrapper, null, createElement(RootLayout, props));
        },
      };
    },
    layout[1],
  ];

  return [segment, parallelRoutes, { ...modules, layout: wrappedLayout }, metadata] as LoaderTree;
}

export function findDeepestAccessFallbackModule(
  loaderTree: LoaderTree,
  moduleName: "not-found" | "forbidden" | "unauthorized",
): LoaderTreeModule | undefined {
  const [, parallelRoutes, modules] = loaderTree;

  for (const childTree of Object.values(parallelRoutes)) {
    const child = findDeepestAccessFallbackModule(childTree as LoaderTree, moduleName);
    if (child) return child;
  }

  return (modules as Record<string, LoaderTreeModule | undefined>)[moduleName];
}

export function hasNextErrorBoundary(loaderTree: LoaderTree): boolean {
  const [, parallelRoutes, modules] = loaderTree;
  const moduleMap = modules as Record<string, LoaderTreeModule | undefined>;
  if (moduleMap.error || moduleMap["global-error"]) return true;

  return Object.values(parallelRoutes).some((childTree) =>
    hasNextErrorBoundary(childTree as LoaderTree),
  );
}

export function replacePageModule(
  loaderTree: LoaderTree,
  pageFile: string,
  createPageModule: (originalPageModule: LoaderTreeModule | undefined) => LoaderTreeModule,
): { loaderTree: LoaderTree; replaced: boolean } {
  const [segment, parallelRoutes, modules, metadata] = loaderTree;
  let replaced = modules.page?.[1] === pageFile;
  const nextModules = replaced ? { ...modules, page: createPageModule(modules.page) } : modules;
  const nextParallelRoutes: Record<string, LoaderTree> = {};

  for (const [key, childTree] of Object.entries(parallelRoutes)) {
    const child = replacePageModule(childTree as LoaderTree, pageFile, createPageModule);
    nextParallelRoutes[key] = child.loaderTree;
    replaced ||= child.replaced;
  }

  return {
    loaderTree: [segment, nextParallelRoutes, nextModules, metadata] as LoaderTree,
    replaced,
  };
}

export function replaceFirstPageModule(
  loaderTree: LoaderTree,
  createPageModule: (originalPageModule: LoaderTreeModule | undefined) => LoaderTreeModule,
): { loaderTree: LoaderTree; replaced: boolean } {
  const [segment, parallelRoutes, modules, metadata] = loaderTree;
  if (modules.page) {
    return {
      loaderTree: [
        segment,
        parallelRoutes,
        { ...modules, page: createPageModule(modules.page) },
        metadata,
      ] as LoaderTree,
      replaced: true,
    };
  }

  const nextParallelRoutes: Record<string, LoaderTree> = {};
  let replaced = false;

  for (const [key, childTree] of Object.entries(parallelRoutes)) {
    if (replaced) {
      nextParallelRoutes[key] = childTree as LoaderTree;
      continue;
    }

    const child = replaceFirstPageModule(childTree as LoaderTree, createPageModule);
    nextParallelRoutes[key] = child.loaderTree;
    replaced = child.replaced;
  }

  return {
    loaderTree: [segment, nextParallelRoutes, modules, metadata] as LoaderTree,
    replaced,
  };
}

export function collectLoaderTreeFilePaths(loaderTree: LoaderTree, filePaths = new Set<string>()) {
  const [, parallelRoutes, modules] = loaderTree;

  for (const moduleValue of Object.values(modules)) {
    if (Array.isArray(moduleValue) && typeof moduleValue[1] === "string") {
      filePaths.add(moduleValue[1]);
    }
  }
  for (const child of Object.values(parallelRoutes)) {
    collectLoaderTreeFilePaths(child as LoaderTree, filePaths);
  }

  return filePaths;
}

function createLoaderTree(
  routePattern: string,
  pageModule: LoaderTreeModule,
  rootLayoutModule: LoaderTreeModule,
): LoaderTree {
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  let child: LoaderTree = [PAGE_SEGMENT_KEY, {}, { page: pageModule }, null] as never;

  for (let index = patternSegs.length - 1; index >= 0; index--) {
    child = [patternSegs[index]!, { children: child }, {}, null] as never;
  }

  return ["", { children: child }, { layout: rootLayoutModule }, null] as LoaderTree;
}
// End adapted
