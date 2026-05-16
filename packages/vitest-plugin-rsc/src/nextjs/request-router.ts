import type { ResolveRoutesQuery } from "@next/routing";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import { createNextRoutingData } from "./routing-data";

export type NextRouteManifestEntry = {
  route: string;
  appPath: string;
  pageFile: string;
  loaderTree: LoaderTree;
};

export type NextRouteHandlerManifestEntry = {
  route: string;
  appPath: string;
  routeFile: string;
};

export type NextRouteManifest = {
  pages: NextRouteManifestEntry[];
  routeHandlers: NextRouteHandlerManifestEntry[];
  customRoutes: NextCustomRoutes;
};

export type NextCustomRoute = {
  source: string;
  destination?: string;
  permanent?: boolean;
  statusCode?: number;
  has?: unknown[];
  missing?: unknown[];
  headers?: { key: string; value: string }[];
};

export type NextCustomRoutes = {
  headers: NextCustomRoute[];
  redirects: NextCustomRoute[];
  rewrites: {
    beforeFiles: NextCustomRoute[];
    afterFiles: NextCustomRoute[];
    fallback: NextCustomRoute[];
  };
};

type RouteMatches = Record<string, string | string[]>;
type NextRoutingModule = typeof import("@next/routing");

export type NextRequestTarget =
  | {
      kind: "app-page";
      entry: NextRouteManifestEntry;
      requestedUrl: URL;
      invocationUrl: URL;
      routeMatches: RouteMatches;
      responseHeaders: Headers;
      status?: number;
    }
  | {
      kind: "app-route";
      entry: NextRouteHandlerManifestEntry;
      requestedUrl: URL;
      invocationUrl: URL;
      routeMatches: RouteMatches;
      responseHeaders: Headers;
      status?: number;
    }
  | {
      kind: "redirect";
      url: URL;
      status: number;
      responseHeaders: Headers;
    }
  | {
      kind: "external-rewrite";
      url: URL;
      responseHeaders: Headers;
      status?: number;
    }
  | {
      kind: "not-found";
      requestedUrl: URL;
      responseHeaders: Headers;
      status?: number;
    };

let nextRoutingModulePromise: Promise<NextRoutingModule> | undefined;

// Central request target resolution for Next App Router tests.
//
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next-routing/src/resolve-routes.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next-routing/src/types.ts
// Adaptation: Vitest owns discovered app-page/app-route entries and has no
// production middleware server. This boundary feeds those route facts plus
// next.config custom routes into `@next/routing`, then maps the standalone
// routing result back to the render-target union consumed by the test helper.
export async function resolveNextRequestTarget(options: {
  url: string;
  route?: string;
  headers?: Headers | Record<string, string>;
  manifest: NextRouteManifest;
}): Promise<NextRequestTarget> {
  const requestedUrl = new URL(options.url, "http://localhost");
  const routingData = createNextRoutingData(options.manifest);
  const { resolveRoutes } = await loadNextRoutingModule();
  const result = await resolveRoutes({
    url: requestedUrl,
    buildId: "BUILD_ID",
    basePath: "",
    requestBody: createEmptyRequestBody(),
    headers: toHeaders(options.headers),
    pathnames: routingData.pathnames,
    routes: routingData.routes,
    invokeMiddleware: async () => ({}),
  });
  const responseHeaders = result.resolvedHeaders ?? new Headers();

  if (result.redirect) {
    return {
      kind: "redirect",
      url: result.redirect.url,
      status: result.redirect.status,
      responseHeaders,
    };
  }

  if (result.externalRewrite) {
    return {
      kind: "external-rewrite",
      url: result.externalRewrite,
      responseHeaders,
      status: result.status,
    };
  }

  const invocationUrl = createInvocationUrl(requestedUrl, result.invocationTarget);
  const page = findResolvedRoute(options.manifest.pages, options.route, result.resolvedPathname);
  if (page) {
    return {
      kind: "app-page",
      entry: page,
      requestedUrl,
      invocationUrl,
      routeMatches: normalizeRouteMatches(result.routeMatches),
      responseHeaders,
      status: result.status,
    };
  }

  const routeHandler = findResolvedRoute(
    options.manifest.routeHandlers,
    options.route,
    result.resolvedPathname,
  );
  if (routeHandler) {
    return {
      kind: "app-route",
      entry: routeHandler,
      requestedUrl,
      invocationUrl,
      routeMatches: normalizeRouteMatches(result.routeMatches),
      responseHeaders,
      status: result.status,
    };
  }

  return {
    kind: "not-found",
    requestedUrl,
    responseHeaders,
    status: result.status,
  };
}

function matchRoutePattern(routePattern: string, pathname: string) {
  return matchRoutePatternParams(routePattern, pathname) !== undefined;
}

export function assertRoutePatternMatchesPath(routePattern: string, pathname: string) {
  if (matchRoutePattern(routePattern, pathname)) return;

  throw new Error(`Pattern "${routePattern}" does not match pathname "${pathname}".`);
}

export function resolveRedirectUrl(redirectUrl: string, baseUrl: string) {
  const base = new URL(baseUrl, "http://localhost");
  const target = new URL(redirectUrl, base);
  if (target.origin !== base.origin) {
    throw new Error(`renderServer cannot follow external Next redirect "${target.href}".`);
  }

  return formatRelativeUrl(target);
}

async function loadNextRoutingModule() {
  nextRoutingModulePromise ??= import("@next/routing").then((routingModule) => {
    const moduleWithDefault = routingModule as NextRoutingModule & {
      default?: NextRoutingModule;
    };
    return typeof moduleWithDefault.resolveRoutes === "function"
      ? moduleWithDefault
      : moduleWithDefault.default!;
  });
  return nextRoutingModulePromise;
}

function createEmptyRequestBody() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}

function toHeaders(headers: Headers | Record<string, string> | undefined) {
  return headers ? new Headers(headers) : new Headers();
}

function createInvocationUrl(
  requestedUrl: URL,
  invocationTarget:
    | {
        pathname: string;
        query: ResolveRoutesQuery;
      }
    | undefined,
) {
  const invocationUrl = new URL(requestedUrl.toString());
  if (!invocationTarget) return invocationUrl;

  invocationUrl.pathname = invocationTarget.pathname;
  invocationUrl.search = "";
  for (const [key, value] of Object.entries(invocationTarget.query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        invocationUrl.searchParams.append(key, item);
      }
    } else {
      invocationUrl.searchParams.set(key, value);
    }
  }
  return invocationUrl;
}

function normalizeRouteMatches(matches: Record<string, string> | undefined): RouteMatches {
  const routeMatches: RouteMatches = {};
  for (const [key, value] of Object.entries(matches ?? {})) {
    if (/^\d+$/.test(key)) continue;
    routeMatches[key] = value;
  }
  return routeMatches;
}

function findResolvedRoute<T extends { route: string }>(
  entries: T[],
  route: string | undefined,
  resolvedPathname: string | undefined,
) {
  if (!resolvedPathname) return;
  if (route && route !== resolvedPathname) return;
  return entries.find((entry) => entry.route === resolvedPathname);
}

function matchRoutePatternParams(routePattern: string, pathname: string): RouteMatches | undefined {
  try {
    const normalizedRoutePattern = normalizeRoutePattern(routePattern);
    const params = getRouteMatcher(getRouteRegex(normalizedRoutePattern))(pathname);
    return params ? (params as RouteMatches) : undefined;
  } catch {
    return;
  }
}

function formatRelativeUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function normalizeRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}
