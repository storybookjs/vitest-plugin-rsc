import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Compiled, NextLayer, NextProject } from "../project.ts";
import type { NextContext } from "./context.ts";
import { exportStubs } from "./module-exports.ts";

// The source files whose TypeScript and JSX Vite compiles: not a `.js` file.
const compiledByVite = /\.(?:m?ts|[jt]sx)$/;

/** Next's SWC transform of a module of the app, and the `paths` of its tsconfig. */
export async function createCompiler(
  context: NextContext,
): Promise<Pick<NextProject, "compile" | "paths">> {
  const { root, fail, config, appDir, pageExtensions, distDir, next } = context;
  const { WEBPACK_LAYERS, getLoaderSWCOptions, getRSCModuleInformation, loadJsConfig, swc } = next;
  // Next's SWC transform, with the options next-swc-loader gives it for a
  // module of the app in a layer.
  await swc.loadBindings(config.experimental.useWasmBinary);
  const { jsConfig, resolvedBaseUrl } = await loadJsConfig(root, config);
  const paths = resolvedBaseUrl && {
    baseUrl: resolvedBaseUrl.baseUrl,
    explicitBaseUrl: !resolvedBaseUrl.isImplicit,
    patterns: (jsConfig?.compilerOptions?.paths ?? {}) as Record<string, string[]>,
  };
  const bundleLayers = {
    rsc: WEBPACK_LAYERS.reactServerComponents,
    ssr: WEBPACK_LAYERS.serverSideRendering,
    browser: WEBPACK_LAYERS.appPagesBrowser,
  };
  const swcOptions = (file: string, layer: NextLayer) => {
    const {
      // "use server" and "use cache": Vite RSC compiles server functions.
      serverActions: _serverActions,
      // An optimization of a bundle, like `modularizeImports` and
      // `optimizePackageImports` below. They import a package by other paths
      // than the app does, and Vite pre-bundles what the app imports.
      cjsRequireOptimizer: _cjsRequireOptimizer,
      // The targets, Node.js or the browsers: the browser runs the code as it
      // is.
      env: _env,
      ...options
    } = getLoaderSWCOptions({
      filename: file,
      development: false,
      isServer: layer !== "browser",
      pagesDir: undefined,
      appDir,
      isPageFile: false,
      isCacheComponents: config.cacheComponents,
      hasReactRefresh: false,
      configDir: root,
      modularizeImports: undefined,
      optimizePackageImports: undefined,
      swcPlugins: config.experimental.swcPlugins,
      compilerOptions: config.compiler,
      jsConfig,
      supportedBrowsers: undefined,
      swcCacheDir: path.join(distDir, "cache", "swc"),
      relativeFilePathFromRoot: path.relative(root, file),
      serverComponents: true,
      serverReferenceHashSalt: "",
      bundleLayer: bundleLayers[layer],
      esm: true,
      cacheHandlers: config.cacheHandlers,
      useCacheEnabled: config.experimental.useCache,
      taintEnabled: config.experimental.taint,
      pageExtensions,
    }) as Record<string, unknown> & {
      jsc: { transform: Record<string, unknown>; experimental: object };
    };
    // `typeof window` and `process.env.NODE_ENV` are defines here, see
    // plugin.ts and server-code.ts.
    const {
      optimizer: _optimizer,
      regenerator: _regenerator,
      react,
      ...transform
    } = options.jsc.transform;
    return {
      ...options,
      jsc: {
        ...options.jsc,
        target: "esnext",
        // Not imports of `@swc/helpers`, which is Next's dependency.
        externalHelpers: false,
        // For webpack's parser, which reads `assert`.
        experimental: { ...options.jsc.experimental, emitAssertForImportAttributes: false },
        transform: {
          ...transform,
          // Vite compiles JSX as it does without this plugin, for React's
          // development runtime. Not in a `.js` file, which Next takes JSX
          // in too.
          react: compiledByVite.test(file) ? { ...(react as object), runtime: "preserve" } : react,
        },
      },
      filename: file,
      sourceFileName: file,
      sourceMaps: true,
    };
  };
  const compile = async (code: string, file: string, layer: NextLayer) => {
    const options = swcOptions(file, layer);
    let output: Compiled;
    try {
      output = await swc.transform(code, options);
    } catch (error) {
      // What `next build` stops at, like a client hook in a Server Component.
      // The module throws Next's error when it loads, as in webpack's
      // development build, so that the test gets it: a module that does not
      // compile only tells a browser that its import failed. It has no
      // imports, which would run first, apart from an `export *`, and it
      // keeps its exports, for the modules that import it to link.
      const exports = await exportStubs(code, file).catch(() => Promise.reject(error));
      const message = stripVTControlCharacters((error as Error).message ?? String(error)).trim();
      return { code: `throw new Error(${JSON.stringify(message)});\n${exports}` };
    }
    // In the rsc layer Next turns a client module into its own proxy. Vite
    // RSC makes the references from the source, which it has to parse: where
    // Vite does not compile the JSX, from the module as the other layers get it.
    if (layer === "rsc" && getRSCModuleInformation(output.code, true).type === "client") {
      if (compiledByVite.test(file)) return;
      return swc.transform(code, { ...options, serverComponents: undefined });
    }
    return output;
  };
  // What the plugin relies on of the transform.
  const fontCall = await compile(
    `import { Inter } from "next/font/google";\nexport const inter = Inter({});\n`,
    path.join(appDir, "layout.js"),
    "rsc",
  );
  if (!fontCall?.code.includes("next/font/google/target.css?")) {
    fail("the SWC transform no longer turns a call of a `next/font` function into an import");
  }
  if (await compile(`"use client";\nexport const a = 1;\n`, path.join(appDir, "a.ts"), "rsc")) {
    fail('the SWC transform no longer marks a `"use client"` module of the rsc layer');
  }

  return { compile, paths };
}
