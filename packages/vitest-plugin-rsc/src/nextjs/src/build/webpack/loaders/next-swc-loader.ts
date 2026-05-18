import path from "node:path";
import type { Plugin } from "vite";
import {
  loadNextProjectConfig,
  type LoadedJsConfig,
  type NextConfigLike,
} from "../../../../config.ts";
import {
  createProjectRequire,
  getProjectRoot,
  isProjectFile,
  normalizePath,
} from "../../../../plugin-utils.ts";

// Mirror/adapt: Next.js next-swc-loader transform.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-swc-loader.ts#L81-L180
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/swc/options.ts#L385-L560
// Adaptation: Vite runs this as a transform hook instead of a webpack loader.
// `@vitejs/plugin-rsc` owns RSC directives and server references, so this
// adapter invokes Next SWC only for compiler-owned features such as next/font,
// next/dynamic metadata, styled-jsx/compiler options, modular imports, and
// next/server CJS optimization.

// Begin adapted: Next.js next-swc-loader transform
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-swc-loader.ts#L81-L180
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/swc/options.ts#L385-L560
// Adaptation: Translate webpack loader options into the matching Next SWC
// option helper, but leave RSC graph transforms disabled for Vite RSC.
type NextSwc = {
  loadBindings(): Promise<unknown>;
  transform(code: string, options: unknown): Promise<{ code: string; map?: string | null }>;
};

type NextSwcOptionsModule = {
  getLoaderSWCOptions(options: {
    filename: string;
    development: boolean;
    isServer: boolean;
    pagesDir?: string;
    appDir?: string;
    isPageFile: boolean;
    isCacheComponents?: boolean;
    hasReactRefresh: boolean;
    optimizeServerReact?: boolean;
    modularizeImports?: unknown;
    optimizePackageImports?: unknown;
    swcPlugins?: unknown;
    compilerOptions?: unknown;
    jsConfig?: unknown;
    supportedBrowsers?: string[];
    swcCacheDir: string;
    relativeFilePathFromRoot: string;
    esm?: boolean;
    serverComponents?: boolean;
    serverReferenceHashSalt: string;
    bundleLayer?: string;
    cacheHandlers?: unknown;
    useCacheEnabled?: boolean;
    taintEnabled?: boolean;
    trackDynamicImports?: boolean;
    pageExtensions?: string[];
  }): unknown;
};

type NextSwcTransformContext = {
  nextSwc: NextSwc;
  nextSwcOptions: NextSwcOptionsModule;
  nextConfig: NextConfigLike;
  loadedJsConfig: LoadedJsConfig;
  appDir?: string;
  pagesDir?: string;
  supportedBrowsers?: string[];
  isDev: boolean;
  distDir: string;
  pageExtensions: string[];
};

// Vite RSC owns the directive graph and server action wiring. Keep Next SWC
// focused on compiler features that do not own the RSC module protocol.
const nextSwcTransformConditions = /next\/font|next\/dynamic/;

export function useNextSwcTransform(): Plugin {
  let root = process.cwd();
  let mode = "test";
  let contextPromise: Promise<NextSwcTransformContext> | undefined;

  return {
    name: "next-rsc-swc-transform",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      contextPromise = undefined;
    },
    async transform(code, id) {
      if (
        !isUserSourceFile(id) ||
        !isProjectFile(root, id) ||
        !hasSupportedNextSwcTransformTrigger(code)
      )
        return;

      const filename = id.replace(/\?.*$/, "");
      contextPromise ??= createNextSwcTransformContext(root, mode);
      const context = await contextPromise;
      const isServer = this.environment.name === "client";
      const isPageFile = context.pagesDir ? filename.startsWith(context.pagesDir) : false;
      const inputSourceMap = this.getCombinedSourcemap();

      return context.nextSwc.transform(code, {
        ...(context.nextSwcOptions.getLoaderSWCOptions({
          filename,
          development:
            context.isDev || context.nextConfig.experimental?.allowDevelopmentBuild === true,
          isServer,
          pagesDir: context.pagesDir,
          appDir: context.appDir,
          isPageFile,
          isCacheComponents: context.nextConfig.cacheComponents,
          hasReactRefresh: false,
          modularizeImports: context.nextConfig.modularizeImports,
          optimizePackageImports: context.nextConfig.experimental?.optimizePackageImports,
          swcPlugins: context.nextConfig.experimental?.swcPlugins,
          compilerOptions: context.nextConfig.compiler,
          jsConfig: context.loadedJsConfig.jsConfig,
          supportedBrowsers: isServer ? undefined : context.supportedBrowsers,
          swcCacheDir: path.join(root, context.distDir, "cache", "swc"),
          relativeFilePathFromRoot: normalizePath(path.relative(root, filename)),
          esm: true,
          // Vite RSC owns client references and server actions. We still use
          // Next's shared SWC compiler for transforms that are independent of
          // the webpack/Turbopack module graph: fonts, next/dynamic metadata,
          // styled-jsx/compiler options, modularized imports, and next/server
          // CJS optimization.
          serverComponents: false,
          serverReferenceHashSalt: "",
          cacheHandlers: context.nextConfig.cacheHandlers,
          useCacheEnabled: context.nextConfig.experimental?.useCache,
          taintEnabled: context.nextConfig.experimental?.taint,
          trackDynamicImports: false,
          pageExtensions: context.pageExtensions,
        }) as Record<string, unknown>),
        inputSourceMap:
          inputSourceMap && typeof inputSourceMap === "object"
            ? JSON.stringify(inputSourceMap)
            : undefined,
        sourceFileName: filename,
        filename,
      });
    },
  };
}

async function createNextSwcTransformContext(
  root: string,
  mode: string,
): Promise<NextSwcTransformContext> {
  const projectRequire = createProjectRequire(root);
  const nextSwc = projectRequire("next/dist/build/swc/index.js") as NextSwc;
  const nextSwcOptions = projectRequire("next/dist/build/swc/options.js") as NextSwcOptionsModule;
  const projectConfig = await loadNextProjectConfig(root, mode);

  await nextSwc.loadBindings();

  return {
    nextSwc,
    nextSwcOptions,
    nextConfig: projectConfig.nextConfig,
    loadedJsConfig: projectConfig.loadedJsConfig,
    supportedBrowsers: projectConfig.supportedBrowsers,
    isDev: projectConfig.isDev,
    appDir: projectConfig.appDir,
    pagesDir: projectConfig.pagesDir,
    distDir: projectConfig.distDir,
    pageExtensions: projectConfig.pageExtensions,
  };
}

function isUserSourceFile(id: string) {
  return (
    /\.(?:[cm]?[jt]sx?)($|\?)/.test(id) && !id.includes("/node_modules/") && !id.includes("/.vite/")
  );
}

function hasSupportedNextSwcTransformTrigger(code: string) {
  return nextSwcTransformConditions.test(code);
}
// End adapted
