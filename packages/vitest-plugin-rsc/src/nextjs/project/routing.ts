import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AdapterOutputs, NextAdapter } from "next/dist/build/adapter/build-complete.js";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info.js";
import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from "next/dist/build/webpack/plugins/middleware-plugin.js";
import { receivers } from "../adapter.ts";
import type { NextRouting } from "../project.ts";
import { inDirectory, type NextContext } from "./context.ts";
import type { AppRoutes } from "./routes.ts";

// The server in front of the app: the middleware, and the routes that Next's
// build hands a deployment adapter.

// A pathname the way a URL has it: `/%C3%BCber` for `/über`.
function urlPathname(pathname: string): string {
  const url = new URL("http://localhost");
  url.pathname = pathname;
  return url.pathname;
}

// What the build has to answer a request with, by the pathname Next serves it
// at: the app pages and the route handlers, which is all this build makes.
// `resolveRoutes()` compares the pathname of a request with these as it is,
// so each one is there in the ways a request has it: percent-encoded, as a
// URL has `/über`, and with `trailingSlash` with the slash. That is the
// adapter's part, and Next's own adapters do the same.
function outputPagesOf(outputs: AdapterOutputs, trailingSlash: boolean): Record<string, string> {
  const pages: Record<string, string> = {};
  for (const { pathname, sourcePage } of [...outputs.appPages, ...outputs.appRoutes]) {
    for (const requested of new Set([pathname, urlPathname(pathname)])) {
      pages[requested] = sourcePage;
      if (trailingSlash && !requested.endsWith("/")) pages[`${requested}/`] = sourcePage;
    }
  }
  return pages;
}

/** The middleware of the app, as `findMiddleware()` finds it. */
export type FoundMiddleware = Awaited<ReturnType<typeof findMiddleware>>;

export async function findMiddleware(context: NextContext) {
  const { root, fail, config, appDir, pageExtensions, next } = context;
  const {
    MIDDLEWARE_FILENAME,
    PROXY_FILENAME,
    createPagesMapping,
    getFilesInDir,
    getStaticInfoIncludingLayouts,
    rootPageType,
  } = next;
  // The `proxy.ts` of the app, or the `middleware.ts` it was before Next.js
  // 16: the file next to `app/` that Next's build looks for. A file, and not
  // a folder of that name. Of two with the name, the first page extension.
  const rootDir = path.dirname(appDir);
  const rootFiles = await getFilesInDir(rootDir);
  const middlewareFiles = [PROXY_FILENAME, MIDDLEWARE_FILENAME].flatMap((name) => {
    const file = pageExtensions
      .map((extension) => `${name}.${extension}`)
      .find((candidate) => rootFiles.has(candidate));
    return file ? [path.join(rootDir, file)] : [];
  });
  // `next build` fails on this too.
  if (middlewareFiles.length > 1) {
    const files = middlewareFiles.map((file) => path.relative(root, file));
    throw new Error(
      `vitest-plugin-rsc: the app has both ${files.join(" and ")}. Next.js takes one of them.`,
    );
  }
  const [middlewareFile] = middlewareFiles;
  const middleware = middlewareFile
    ? await (async () => {
        // Its page name, like `/proxy` or `/src/proxy`, and where Next's build
        // imports it from.
        const mapped = await createPagesMapping({
          isDev: false,
          pageExtensions,
          pagePaths: [middlewareFile.replace(root, "")],
          pagesType: rootPageType,
          pagesDir: undefined,
          appDir,
          appDirOnly: true,
        });
        const [entry] = Object.entries(mapped);
        const [page, pagePath] =
          entry ?? fail(`\`createPagesMapping()\` has no page for ${middlewareFile}`);
        // What Next's build reads in the file: its `config`, with the matcher.
        const staticInfo = await getStaticInfoIncludingLayouts({
          isInsideAppDir: false,
          pageExtensions,
          pageFilePath: middlewareFile,
          appDir,
          config,
          isDev: false,
          page,
        });
        return { page, pagePath, staticInfo };
      })()
    : undefined;

  return { middlewareFile, middleware };
}

/** `adapterPath` is the file of the adapter that Next's build hands the routes to: adapter.ts. */
export async function buildRouting(
  context: NextContext,
  { routes, appPathsPerRoute }: AppRoutes,
  { middleware }: FoundMiddleware,
  adapterPath: string,
) {
  const {
    root,
    projectRequire,
    version,
    fail,
    config,
    buildId,
    buildEnvironment,
    previewProps,
    next,
  } = context;
  const {
    Bundler,
    generateInterceptionRoutesRewrites,
    generateRoutesManifest,
    getNamedMiddlewareRegex,
    handleBuildComplete,
    loadCustomRoutes,
  } = next;
  // The server in front of the app goes by what `next build` hands a
  // deployment adapter: the redirects, rewrites and headers of `next.config`,
  // the matcher of the middleware, a pattern for each dynamic route, and what
  // the build has for each pathname. That part of the build runs here, and
  // `resolveRoutes()` of `@next/routing` takes the outcome as it is.
  //
  // That package is not a part of `next`. It reads what one version of Next
  // hands an adapter, so it has to be the one of that version.
  let routingVersion: string;
  try {
    ({ version: routingVersion } = projectRequire("@next/routing/package.json") as {
      version: string;
    });
  } catch (error) {
    throw new Error(
      `vitest-plugin-rsc/nextjs needs @next/routing, the package of Next.js that resolves ` +
        `the route of a request. Install it at the version of next: @next/routing@${version}.`,
      { cause: error },
    );
  }
  if (routingVersion !== version) {
    throw new Error(
      `vitest-plugin-rsc/nextjs needs @next/routing at the version of next, and found ` +
        `@next/routing@${routingVersion} next to next@${version}. Install @next/routing@${version}.`,
    );
  }
  // What the build made, for that part of it: a function for every route and
  // one for the middleware. They are listed as the kind Next reads no files
  // of a build for, an edge function, though they run as on Node.js. Only the
  // pathname of an output and the matcher of the middleware come back.
  const edgeFunction = (
    name: string,
    page: string,
    matchers: ProxyMatcher[] = [],
  ): EdgeFunctionDefinition => ({
    name,
    page,
    matchers,
    env: buildEnvironment,
    // What a bundler writes: there are no files.
    entrypoint: "",
    files: [],
    wasm: [],
    assets: [],
  });
  const middlewareManifest: MiddlewareManifest = {
    version: 3,
    sortedMiddleware: middleware ? ["/"] : [],
    middleware: middleware
      ? {
          "/": edgeFunction(
            middleware.page.slice(1),
            "/",
            // Without a matcher of its own it is for every path, as Next's
            // build writes that.
            middleware.staticInfo.middleware?.matchers ?? [
              {
                regexp: getNamedMiddlewareRegex("/", { catchAll: true }).namedRegex,
                originalSource: "/:path*",
              },
            ],
          ),
        }
      : {},
    functions: Object.fromEntries(
      routes.map((route) => [route.page, edgeFunction(`app${route.page}`, route.page)]),
    ),
  };
  type BuildComplete = Parameters<NonNullable<NextAdapter["onBuildComplete"]>>[0];
  // The config that the server in front of the app is made from. Without
  // `output: "export"`, which has Next's build read the files it exported:
  // the routes of the app are the same without it.
  const routedConfig = { ...config, output: undefined };
  // `next.config` is the app's, and so is the working directory when its
  // `redirects()` runs. One project at a time, as for the config itself.
  const { built, routesManifest } = await inDirectory(root, async () => {
    const { redirects, headers, onMatchHeaders, rewrites } = await loadCustomRoutes(routedConfig);
    const appPaths = Object.keys(appPathsPerRoute);
    // An interception route is a rewrite to Next: for a request that comes
    // from the page it intercepts on.
    rewrites.beforeFiles.push(...generateInterceptionRoutesRewrites(appPaths, config.basePath));
    const { routesManifest } = generateRoutesManifest({
      appType: "app",
      pageKeys: { pages: [], app: appPaths },
      config: routedConfig,
      redirects,
      headers,
      onMatchHeaders,
      rewrites,
      restrictedRedirectPaths: [`${config.basePath}/_next`],
      isAppPPREnabled: Boolean(config.cacheComponents),
      deploymentId: config.deploymentId,
    });
    // Next reads the directory of a build for what it calls static files. This
    // build has none: an empty one.
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-"));
    fs.mkdirSync(path.join(buildDir, "static"));
    // Next logs that it runs the adapter, which is no news for a test run.
    const { log } = console;
    console.log = (...message) => {
      if (!String(message[0]).includes("onBuildComplete")) log(...message);
    };
    try {
      const built = await new Promise<BuildComplete>((resolve, reject) => {
        receivers.set(buildDir, resolve);
        handleBuildComplete({
          adapterPath,
          dir: root,
          distDir: buildDir,
          configOutDir: path.join(root, "out"),
          repoRoot: config.repoRoot,
          outputFileTracingRoot: config.outputFileTracingRoot || root,
          config: routedConfig,
          appType: "app",
          buildId,
          nextVersion: version,
          // Not webpack: for that one Next traces the files of its Node.js
          // server here, which the tab does not run.
          bundler: Bundler.Turbopack,
          routesManifest,
          middlewareManifest,
          // No page is prerendered, and no route is listed as one for
          // Node.js: see `edgeFunction`.
          prerenderManifest: {
            version: 4,
            routes: {},
            dynamicRoutes: {},
            notFoundRoutes: [],
            preview: previewProps,
          },
          functionsConfigManifest: { version: 1, functions: {} },
          previewProps,
          pageKeys: [],
          appPageKeys: routes.map((route) => route.page),
          staticPages: new Set(),
          serverPropsPages: new Set(),
          requiredServerFiles: [],
          hasNodeMiddleware: false,
          hasInstrumentationHook: false,
          hasStatic404: false,
          hasStatic500: false,
        }).then(
          () => reject(new Error("it does not call `onBuildComplete` of the adapter")),
          reject,
        );
      });
      return { built, routesManifest };
    } catch (error) {
      return fail(
        `\`handleBuildComplete()\` does not hand an adapter the routes of an app without a ` +
          `build on disk (${(error as Error).message})`,
        error,
      );
    } finally {
      console.log = log;
      receivers.delete(buildDir);
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });
  for (const phase of [
    "beforeMiddleware",
    "beforeFiles",
    "afterFiles",
    "dynamicRoutes",
    "onMatch",
    "fallback",
  ] as const) {
    if (!Array.isArray(built.routing?.[phase])) {
      fail(`\`handleBuildComplete()\` hands an adapter no \`routing.${phase}\``);
    }
  }
  const routing: NextRouting = {
    routes: built.routing,
    basePath: config.basePath,
    buildId,
    outputs: outputPagesOf(built.outputs, config.trailingSlash),
  };
  // Without these two every URL is a 404, and nothing says why: the build has
  // an output for every route, and `resolveRoutes()` finds it for a URL of
  // that route.
  const { resolveRoutes } = projectRequire("@next/routing") as typeof import("@next/routing");
  const outputPages = new Set(Object.values(routing.outputs));
  const unmatchedRoutes: string[] = [];
  for (const route of routes) {
    if (!outputPages.has(route.page)) {
      fail(`\`handleBuildComplete()\` has no output for ${route.page}`);
    }
    const isDynamic = route.pathname.includes("[");
    // A URL of the route: its pathname, with a value for each dynamic segment.
    // The page of `/` is at the base path itself.
    const sample = route.pathname.replace(/\[\[?(?:\.\.\.)?[^\]]+\]\]?/g, "-x-");
    const pathname = config.basePath + (sample === "/" && config.basePath ? "" : sample);
    const url = new URL("http://localhost");
    url.pathname = pathname;
    // Next's pattern for a dynamic route has the folders as they are named,
    // and `resolveRoutes()` holds the pathname of a URL against it, which has
    // `über` percent-encoded. So it does not find such a route, in any Next.
    if (isDynamic && url.pathname !== pathname) {
      unmatchedRoutes.push(route.pathname);
      continue;
    }
    const resolved = await resolveRoutes({
      url,
      headers: new Headers(),
      requestBody: new ReadableStream(),
      basePath: routing.basePath,
      buildId: routing.buildId,
      pathnames: Object.keys(routing.outputs),
      // Only the routes of the app: not what `next.config` or the middleware
      // sends elsewhere.
      routes: {
        ...routing.routes,
        beforeMiddleware: [],
        middlewareMatchers: [],
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      invokeMiddleware: async () => ({}),
    });
    const page = routing.outputs[resolved.resolvedPathname ?? ""];
    // A URL of a dynamic route can be another route's as well.
    if (isDynamic ? page === undefined : page !== route.page) {
      fail(
        `\`resolveRoutes()\` of @next/routing@${routingVersion} does not find ${route.pathname} ` +
          `in the routes that \`handleBuildComplete()\` hands an adapter`,
      );
    }
  }

  return { routing, routesManifest, unmatchedRoutes };
}
