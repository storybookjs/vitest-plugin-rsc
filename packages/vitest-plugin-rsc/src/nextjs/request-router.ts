import type { RouteInvocationTarget } from "@next/routing";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { normalizeNextQueryParam } from "next/dist/server/web/utils.js";
import { removePathPrefix } from "next/dist/shared/lib/router/utils/remove-path-prefix.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";
import { resolveRoutes } from "./next-routing.ts";
import type { NextRoutingData } from "./routing-types.ts";

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
  routingData: NextRoutingData;
};

type RouteMatches = Record<string, string | string[]>;

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
  const routingData = options.manifest.routingData;
  const result = await resolveRoutes({
    url: requestedUrl,
    buildId: routingData.buildId,
    basePath: routingData.basePath,
    i18n: routingData.i18n,
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

  const headerRedirect = resolveHeaderRedirect(responseHeaders, result.status, requestedUrl);
  if (headerRedirect) {
    return {
      kind: "redirect",
      url: headerRedirect.url,
      status: headerRedirect.status,
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
  const resolvedRoutePathname = removeResolvedBasePath(
    result.resolvedPathname,
    routingData.basePath,
  );
  const page = findResolvedRoute(options.manifest.pages, options.route, resolvedRoutePathname);
  if (page) {
    return {
      kind: "app-page",
      entry: page,
      requestedUrl,
      invocationUrl,
      routeMatches: resolveRouteMatches(
        page.route,
        invocationUrl.pathname,
        result.routeMatches,
        routingData.basePath,
      ),
      responseHeaders,
      status: result.status,
    };
  }

  const routeHandler = findResolvedRoute(
    options.manifest.routeHandlers,
    options.route,
    resolvedRoutePathname,
  );
  if (routeHandler) {
    return {
      kind: "app-route",
      entry: routeHandler,
      requestedUrl,
      invocationUrl,
      routeMatches: resolveRouteMatches(
        routeHandler.route,
        invocationUrl.pathname,
        result.routeMatches,
        routingData.basePath,
      ),
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

export function resolveRedirectUrl(redirectUrl: string, baseUrl: string) {
  const base = new URL(baseUrl, "http://localhost");
  const target = new URL(redirectUrl, base);
  if (target.origin !== base.origin) {
    throw new Error(`renderServer cannot follow external Next redirect "${target.href}".`);
  }

  return formatRelativeUrl(target);
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

function resolveHeaderRedirect(headers: Headers, status: number | undefined, requestedUrl: URL) {
  if (!status || status < 300 || status >= 400) return;
  const location = headers.get("location");
  if (!location) return;

  return {
    url: new URL(location, requestedUrl),
    status,
  };
}

function createInvocationUrl(
  requestedUrl: URL,
  invocationTarget: RouteInvocationTarget | undefined,
) {
  const invocationUrl = new URL(requestedUrl.toString());
  if (!invocationTarget) return invocationUrl;

  invocationUrl.pathname = invocationTarget.pathname;
  invocationUrl.search = "";
  for (const [key, value] of Object.entries(invocationTarget.query)) {
    if (isSyntheticRouteParamQuery(key)) continue;
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

// Mirrors Next's App Router query cleanup after dynamic route matching.
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/base-server.ts
// Adaptation: `@next/routing` returns prefixed route-key query params such as
// `nxtPslug`; Vitest only needs to remove those synthetic keys before invoking
// app render. User-supplied query params with the public key, such as `slug`,
// remain untouched.
function isSyntheticRouteParamQuery(key: string) {
  return normalizeNextQueryParam(key) !== null;
}

function resolveRouteMatches(
  route: string,
  pathname: string,
  fallbackMatches: Record<string, string> | undefined,
  basePath: string,
) {
  return (
    matchRoutePatternParams(route, removeBasePath(pathname, basePath)) ??
    normalizeRouteMatches(fallbackMatches)
  );
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

function removeResolvedBasePath(pathname: string | undefined, basePath: string) {
  return pathname ? removeBasePath(pathname, basePath) : undefined;
}

function removeBasePath(pathname: string, basePath: string) {
  return basePath ? removePathPrefix(pathname, basePath) : pathname;
}

function matchRoutePatternParams(routePattern: string, pathname: string): RouteMatches | undefined {
  try {
    const params = getRouteMatcher(getRouteRegex(ensureLeadingSlash(routePattern)))(pathname);
    return params ? (params as RouteMatches) : undefined;
  } catch {
    return;
  }
}

function formatRelativeUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function ensureLeadingSlash(routePattern: string) {
  return routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
}
