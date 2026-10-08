import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import querystring from "node:querystring";
import { compileFunction } from "node:vm";
import type { NextProject } from "../project.ts";
import type { NextContext } from "./context.ts";

// What Next's webpack loaders use of their context. Each loader here is
// called the way webpack calls it.
export type LoaderContext = {
  getOptions(): unknown;
  _module: { buildInfo: Record<string, unknown> };
  async(): (error: Error | null, ...result: unknown[]) => void;
  currentTraceSpan: TraceSpan;
  resourcePath: string;
  resourceQuery: string;
  context: string;
  rootContext: string;
  emitFile(name: string, content: Buffer): void;
  emitWarning(warning: Error): void;
  emitError(error: Error): void;
  addDependency(file: string): void;
  resolve(
    directory: string,
    request: string,
    callback: (error: Error | null, file?: string) => void,
  ): void;
  getResolve(): () => Promise<never>;
  fs: typeof fs;
  utils: { contextify(context: string, request: string): string };
  sourceMap: boolean;
};
type TraceSpan = {
  traceChild(): TraceSpan;
  traceFn<T>(fn: () => T): T;
  traceAsyncFn<T>(fn: () => T): T;
  setAttribute(): void;
};
export type Loader = (this: LoaderContext, ...input: unknown[]) => unknown;

/** Calls a webpack loader of Next for one module, the way webpack does. */
export type RunLoader = (
  loader: Loader,
  options: unknown,
  resource: string,
  ...input: unknown[]
) => Promise<unknown[]>;

/**
 * Next's webpack loaders for fonts and images, what they emit for the
 * browser, and Next's image optimizer.
 */
export function createLoaders(context: NextContext): Pick<
  NextProject,
  "isImage" | "loadImage" | "loadFont" | "readEmittedFile" | "emittedFiles" | "optimizeImage"
> & {
  runLoader: RunLoader;
} {
  const { root, projectRequire, nextDir, fail, config, next } = context;
  const {
    COMPILER_NAMES,
    getContentType,
    getExtension,
    getNextFontLoader,
    imageOptimizer,
    nextFontLoader,
    nextImageLoader,
    nextImageLoaderRegex,
  } = next;
  // Calls a webpack loader of Next for one module.
  const emitted = new Map<string, Buffer>();
  const span: TraceSpan = {
    traceChild: () => span,
    traceFn: (fn) => fn(),
    traceAsyncFn: (fn) => fn(),
    setAttribute: () => {},
  };
  const runLoader = (
    loader: Loader,
    options: unknown,
    resource: string,
    ...input: unknown[]
  ): Promise<unknown[]> =>
    new Promise((resolve, reject) => {
      const queryAt = resource.indexOf("?");
      const resourcePath = queryAt < 0 ? resource : resource.slice(0, queryAt);
      // A loader either calls back, or returns its result, as a promise or not.
      let callsBack = false;
      const context: LoaderContext = {
        getOptions: () => options,
        _module: { buildInfo: {} },
        async: () => {
          callsBack = true;
          return (error, ...result) => (error ? reject(error) : resolve(result));
        },
        currentTraceSpan: span,
        resourcePath,
        resourceQuery: queryAt < 0 ? "" : resource.slice(queryAt),
        context: path.dirname(resourcePath),
        rootContext: root,
        // Where the browser finds it: under `/_next/`.
        emitFile: (name, content) => emitted.set(name.replace(/^\//, ""), content),
        emitWarning: (warning) => console.warn(warning),
        emitError: reject,
        addDependency: () => {},
        resolve: (directory, request, callback) => {
          const file = path.resolve(directory, request);
          if (fs.existsSync(file)) callback(null, file);
          else callback(new Error(`Can't resolve '${request}' in '${directory}'`));
        },
        getResolve: () => () => Promise.reject(new Error("Not resolved by vitest-plugin-rsc")),
        fs,
        utils: { contextify: (_context, request) => request },
        sourceMap: false,
      };
      Promise.resolve(loader.call(context, ...input)).then(
        (result) => callsBack || resolve([result]),
        reject,
      );
    });

  // next/font: next-font-loader runs the font loader of `@next/font`, and
  // css-loader makes a module of its CSS, as Next's rule for the font does.
  const resolve = (id: string) => {
    try {
      return projectRequire.resolve(id);
    } catch (error) {
      return fail(`${id} is not there`, error);
    }
  };
  // Next's own postcss, which is not a dependency of the app.
  let postcss: unknown;
  try {
    postcss = createRequire(path.join(nextDir, "package.json"))("postcss");
  } catch (error) {
    fail("it no longer depends on `postcss`", error);
  }
  const fontLoaders = (["google", "local"] as const).map((name) => {
    const target = resolve(`next/font/${name}/target.css`);
    const loaders = getNextFontLoader(
      {
        hasAppDir: true,
        isClient: true,
        isServer: false,
        // As `next dev` loads them: without the network, a font of Google
        // Fonts is its fallback font, and Next logs why.
        isDevelopment: true,
        assetPrefix: config.assetPrefix,
        deploymentId: config.deploymentId,
        experimental: config.experimental,
      } as Parameters<typeof getNextFontLoader>[0],
      async () => ({ postcss }),
      resolve(`next/dist/compiled/@next/font/${name}/loader`),
    ) as { loader?: string; options?: unknown }[];
    const cssLoader = loaders.find((entry) => entry.loader?.includes("css-loader"));
    const fontLoader = loaders.find((entry) => entry.loader === "next-font-loader");
    if (!cssLoader?.loader || !fontLoader) {
      fail("`getNextFontLoader()` no longer uses css-loader and next-font-loader");
    }
    return {
      prefix: `next/font/${name}/target.css?`,
      target,
      cssLoader: projectRequire(cssLoader!.loader!).default as Loader,
      cssOptions: cssLoader!.options,
      fontOptions: fontLoader!.options,
    };
  });
  const fonts = new Map<string, Promise<{ css: string; exports: Record<string, unknown> }>>();
  const loadFont = async (request: string) => {
    const font = fontLoaders.find((candidate) => request.startsWith(candidate.prefix))!;
    const resource = font.target + request.slice(font.prefix.length - 1);
    const [css, map, meta] = await runLoader(nextFontLoader, font.fontOptions, resource);
    const [code] = await runLoader(font.cssLoader, font.cssOptions, resource, css, map, meta);
    // The CommonJS module css-loader makes: a list of the CSS of the module,
    // with what it exports as `locals`.
    const cssModule = { id: resource, exports: {} as unknown };
    compileFunction(code as string, ["module", "exports", "require"])(
      cssModule,
      cssModule.exports,
      projectRequire,
    );
    const list = cssModule.exports as unknown[] & { locals?: Record<string, unknown> };
    if (!Array.isArray(list) || !list.locals) {
      fail("css-loader no longer makes a list of CSS with `locals` of a `next/font` call");
    }
    return { css: String(list), exports: list.locals! };
  };

  // Where the browser asks for the files the loaders emit. An asset prefix
  // with an origin is another server.
  const emittedPath = `${config.assetPrefix.startsWith("/") ? config.assetPrefix : ""}/_next/`;
  const { images } = config;

  return {
    runLoader,
    isImage: (file) => !images.disableStaticImages && nextImageLoaderRegex.test(file),
    async loadImage(file) {
      const options = {
        isDev: false,
        compilerType: COMPILER_NAMES.client,
        assetPrefix: config.assetPrefix,
        basePath: config.basePath,
        outputHashSalt: (config as { outputHashSalt?: string }).outputHashSalt,
      };
      const [code] = await runLoader(
        nextImageLoader,
        options,
        file,
        await fs.promises.readFile(file),
      );
      if (typeof code !== "string" || !code.startsWith("export default {")) {
        fail("next-image-loader no longer exports the data of an image");
      }
      return code as string;
    },
    loadFont(request) {
      let font = fonts.get(request);
      if (!font) {
        fonts.set(request, (font = loadFont(request)));
        // A font that failed may load the next time, like a download.
        font.catch(() => fonts.delete(request));
      }
      return font;
    },
    emittedFiles: () =>
      [...emitted].map(([name, body]) => ({ pathname: `${emittedPath}${name}`, body })),
    readEmittedFile(pathname) {
      if (!pathname.startsWith(emittedPath)) return;
      const name = pathname.slice(emittedPath.length);
      const body = emitted.get(name);
      if (!body) return;
      return { body, contentType: getContentType(path.extname(name).slice(1)) ?? "" };
    },
    // What `handleNextImageRequest` of Next's server does, without its cache.
    async optimizeImage(request, response, serveFile) {
      const url = new URL(request.url!, "http://n");
      if (url.pathname !== images.path) return false;
      if (images.loader !== "default" || images.unoptimized) {
        response.statusCode = 404;
        response.end();
        return true;
      }
      const { ImageOptimizerCache, ImageError } = imageOptimizer;
      const query = querystring.parse(url.search.slice(1));
      const params = ImageOptimizerCache.validateParams(request, query, config, false);
      if ("errorMessage" in params) {
        response.statusCode = 400;
        response.end(params.errorMessage);
        return true;
      }
      try {
        const upstream = params.isAbsolute
          ? await imageOptimizer.fetchExternalImage(
              params.href,
              images.dangerouslyAllowLocalIP,
              images.maximumResponseBody,
              images.maximumRedirects,
            )
          : await imageOptimizer.fetchInternalImage(
              params.href,
              request,
              response,
              images.maximumResponseBody,
              serveFile,
            );
        const { buffer, contentType, maxAge, etag } = await imageOptimizer.imageOptimizer(
          upstream,
          params,
          config,
          { isDev: false },
        );
        imageOptimizer.sendResponse(
          request,
          response,
          params.href,
          getExtension(contentType!)!,
          buffer,
          etag,
          params.isStatic,
          "MISS",
          images,
          maxAge,
          // Not for the browser to keep: a test run may follow with another image.
          true,
        );
      } catch (error) {
        if (!(error instanceof ImageError)) throw error;
        response.statusCode = error.statusCode;
        response.end(error.message);
      }
      return true;
    },
  };
}
