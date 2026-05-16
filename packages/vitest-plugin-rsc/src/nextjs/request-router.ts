import { getRedirectStatus, modifyRouteRegex } from "next/dist/lib/redirect-status.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { formatUrl } from "next/dist/shared/lib/router/utils/format-url.js";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match.js";
import {
  matchHas,
  prepareDestination,
} from "next/dist/shared/lib/router/utils/prepare-destination.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";

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

// Mirrors the phase ordering in Next's request router and rewrite resolver:
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/lib/router-utils/resolve-routes.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/shared/lib/router/utils/resolve-rewrites.ts
// Adaptation: Vitest has route-discovery facts but no Next router server,
// filesystem checker, or `@next/routing` data source yet. This local boundary
// delegates matching, interpolation, has/missing checks, route-regex matching,
// app-path normalization, and redirect status handling to installed Next
// helpers (`getPathMatch`, `prepareDestination`, `matchHas`, `getRouteRegex`,
// `getRouteMatcher`, `normalizeAppPath`, and `getRedirectStatus`) so the next
// `@next/routing` slice can narrow or delete the remaining phase-order glue.
export function resolveNextRequestTarget(options: {
  url: string;
  route?: string;
  headers?: Headers | Record<string, string>;
  manifest: NextRouteManifest;
}): NextRequestTarget {
  const requestedUrl = new URL(options.url, "http://localhost");
  const requestedPath = formatRelativeUrl(requestedUrl);
  const redirect = resolveNextCustomRedirect(
    options.manifest.customRoutes.redirects,
    requestedPath,
    options.headers,
  );

  if (redirect) {
    const redirectUrl = createRedirectUrl(redirect.destination, requestedPath);
    const responseHeaders = new Headers();
    responseHeaders.set("location", formatLocationHeader(redirectUrl, requestedUrl));
    return {
      kind: "redirect",
      url: redirectUrl,
      status: redirect.status,
      responseHeaders,
    };
  }

  const rewrittenPath = resolveNextCustomRewrite(
    options.manifest,
    options.manifest.customRoutes.rewrites,
    requestedPath,
    options.headers,
  );
  const invocationUrl = new URL(rewrittenPath, requestedUrl);
  const responseHeaders = resolveNextCustomResponseHeaders(
    options.manifest.customRoutes.headers,
    formatRelativeUrl(invocationUrl),
    options.headers,
  );
  const page = findMatchedRoute(options.manifest.pages, options.route, invocationUrl.pathname);
  if (page) {
    return {
      kind: "app-page",
      entry: page.entry,
      requestedUrl,
      invocationUrl,
      routeMatches: page.params,
      responseHeaders,
    };
  }

  const routeHandler = findMatchedRoute(
    options.manifest.routeHandlers,
    options.route,
    invocationUrl.pathname,
  );
  if (routeHandler) {
    return {
      kind: "app-route",
      entry: routeHandler.entry,
      requestedUrl,
      invocationUrl,
      routeMatches: routeHandler.params,
      responseHeaders,
    };
  }

  return {
    kind: "not-found",
    requestedUrl,
    responseHeaders,
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

function resolveNextCustomResponseHeaders(
  headerRoutes: NextCustomRoute[],
  requestUrl: string,
  headers: Headers | Record<string, string> | undefined,
) {
  const responseHeaders = new Headers();
  for (const headerRoute of headerRoutes) {
    const match = matchNextCustomRoute("header", headerRoute, requestUrl, headers);
    if (!match) continue;

    for (const header of headerRoute.headers ?? []) {
      responseHeaders.set(header.key, interpolateNextCustomRouteValue(header.value, match.params));
    }
  }
  return responseHeaders;
}

function findMatchedRoute<T extends { route: string }>(
  entries: T[],
  route: string | undefined,
  pathname: string,
): { entry: T; params: RouteMatches } | undefined {
  const exact = route ? entries.find((candidate) => candidate.route === route) : undefined;
  if (exact) {
    const params = matchRoutePatternParams(exact.route, pathname);
    if (params) return { entry: exact, params };
    return;
  }

  if (route) return;

  for (const entry of entries) {
    const params = matchRoutePatternParams(entry.route, pathname);
    if (params) return { entry, params };
  }
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

function createRedirectUrl(redirectUrl: string, baseUrl: string) {
  return new URL(redirectUrl, new URL(baseUrl, "http://localhost"));
}

function formatLocationHeader(target: URL, base: URL) {
  return target.origin === base.origin ? formatRelativeUrl(target) : target.href;
}

function formatRelativeUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function interpolateNextCustomRouteValue(value: string, params: Record<string, string | string[]>) {
  return value.replace(/:([A-Za-z0-9_]+)/g, (token, key: string) => {
    const param = params[key];
    if (param === undefined) return token;
    return Array.isArray(param) ? param.join("/") : param;
  });
}

function resolveNextCustomRedirect(
  redirects: NextCustomRoute[],
  requestUrl: string,
  headers: Headers | Record<string, string> | undefined,
) {
  for (const redirect of redirects) {
    const match = matchNextCustomRoute("redirect", redirect, requestUrl, headers);
    if (!match || !redirect.destination) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: redirect.destination,
      params: match.params,
      query: match.query,
    });
    const destination = formatUrl(parsedDestination);
    if (!destination) continue;

    // Calling getRedirectStatus keeps this adapter aligned with Next's
    // permanent/statusCode rules even though tests follow same-origin redirects.
    return {
      destination,
      status: getRedirectStatus(redirect),
    };
  }
}

function resolveNextCustomRewrite(
  routeManifest: NextRouteManifest,
  rewrites: NextCustomRoutes["rewrites"],
  requestUrl: string,
  headers: Headers | Record<string, string> | undefined,
) {
  let rewrittenUrl = requestUrl;

  for (const rewrite of rewrites.beforeFiles) {
    rewrittenUrl = resolveNextCustomRewriteRoute(rewrite, rewrittenUrl, headers) ?? rewrittenUrl;
  }

  if (hasNextStaticRouteMatch(routeManifest, rewrittenUrl)) {
    return rewrittenUrl;
  }

  for (const rewrite of rewrites.afterFiles) {
    const nextUrl = resolveNextCustomRewriteRoute(rewrite, rewrittenUrl, headers);
    if (nextUrl) return nextUrl;
  }

  if (hasNextRouteMatch(routeManifest, rewrittenUrl)) {
    return rewrittenUrl;
  }

  for (const rewrite of rewrites.fallback) {
    const nextUrl = resolveNextCustomRewriteRoute(rewrite, rewrittenUrl, headers);
    if (nextUrl) return nextUrl;
  }

  return rewrittenUrl;
}

function hasNextStaticRouteMatch(routeManifest: NextRouteManifest, requestUrl: string) {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  return (
    routeManifest.pages.some((entry) => isNextStaticRouteMatch(entry.route, pathname)) ||
    routeManifest.routeHandlers.some((entry) => isNextStaticRouteMatch(entry.route, pathname))
  );
}

function isNextStaticRouteMatch(routePattern: string, pathname: string) {
  if (routePattern.includes("[")) return false;
  return normalizeStaticPathname(routePattern) === normalizeStaticPathname(pathname);
}

function normalizeStaticPathname(value: string) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash === "/" ? "/" : withLeadingSlash.replace(/\/$/, "");
}

function hasNextRouteMatch(routeManifest: NextRouteManifest, requestUrl: string) {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  return (
    routeManifest.pages.some((entry) => matchRoutePattern(entry.route, pathname)) ||
    routeManifest.routeHandlers.some((entry) => matchRoutePattern(entry.route, pathname))
  );
}

function resolveNextCustomRewriteRoute(
  rewrite: NextCustomRoute,
  requestUrl: string,
  headers: Headers | Record<string, string> | undefined,
) {
  if (!rewrite.destination) return;

  const match = matchNextCustomRoute("rewrite", rewrite, requestUrl, headers);
  if (!match) return;

  const { parsedDestination } = prepareDestination({
    appendParamsToQuery: true,
    destination: rewrite.destination,
    params: match.params,
    query: match.query,
  });
  if (parsedDestination.protocol) {
    throw new Error(
      `renderServer cannot follow external Next rewrite "${formatUrl(parsedDestination)}".`,
    );
  }

  return formatUrl(parsedDestination);
}

function matchNextCustomRoute(
  type: "header" | "redirect" | "rewrite",
  route: NextCustomRoute,
  requestUrl: string,
  headers: Headers | Record<string, string> | undefined,
) {
  const location = new URL(requestUrl, "http://localhost");
  const query = searchParamsToQuery(location.searchParams);
  const matcher = getPathMatch(route.source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: (regex: string) =>
      modifyRouteRegex(regex, type === "redirect" ? ["/_next"] : undefined),
  });
  let params = matcher(location.pathname);
  if (!params) return;

  if (route.has || route.missing) {
    const hasParams = matchHas(
      { headers: toIncomingHeaders(headers) } as Parameters<typeof matchHas>[0],
      query,
      route.has as never,
      route.missing as never,
    );
    if (!hasParams) return;
    params = { ...params, ...hasParams };
  }

  return { params, query };
}

function searchParamsToQuery(searchParams: URLSearchParams) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const current = query[key];
    if (current === undefined) {
      query[key] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      query[key] = [current, value];
    }
  }
  return query;
}

function toIncomingHeaders(headers: Headers | Record<string, string> | undefined) {
  const incomingHeaders: Record<string, string> = {};
  if (!headers) return incomingHeaders;

  const entries = headers instanceof Headers ? headers.entries() : Object.entries(headers);
  for (const [key, value] of entries) {
    incomingHeaders[key.toLowerCase()] = value;
  }
  return incomingHeaders;
}

function normalizeRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const withoutTrailingSlash = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return normalizeAppPath(`${withoutTrailingSlash}/page`);
}
