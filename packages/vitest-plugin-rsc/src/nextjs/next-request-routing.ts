import { getRedirectStatus, modifyRouteRegex } from "next/dist/lib/redirect-status.js";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths.js";
import { formatUrl } from "next/dist/shared/lib/router/utils/format-url.js";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match.js";
import {
  matchHas,
  prepareDestination,
} from "next/dist/shared/lib/router/utils/prepare-destination.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";

export type NextRouteLike = {
  route: string;
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

export type NextRequestRouteManifest = {
  pages: NextRouteLike[];
  routeHandlers: NextRouteLike[];
  customRoutes: NextCustomRoutes;
};

export function resolveNextCustomRequestUrl(
  routeManifest: NextRequestRouteManifest,
  requestUrl: string,
  headers: Headers | Record<string, string> | undefined,
) {
  const customRoutes = routeManifest.customRoutes;
  const redirect = resolveNextCustomRedirect(customRoutes.redirects, requestUrl, headers);
  if (redirect) {
    return resolveRedirectUrl(redirect, requestUrl);
  }

  return resolveNextCustomRewrite(routeManifest, customRoutes.rewrites, requestUrl, headers);
}

export function resolveNextCustomResponseHeaders(
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

export function matchNextRoutePattern(routePattern: string, pathname: string) {
  return Boolean(matchNextRoutePatternParams(routePattern, pathname));
}

export function matchNextRoutePatternParams(routePattern: string, pathname: string) {
  try {
    const normalizedRoutePattern = normalizeRoutePattern(routePattern);
    return getRouteMatcher(getRouteRegex(normalizedRoutePattern))(pathname);
  } catch {
    return false;
  }
}

export function resolveRedirectUrl(redirectUrl: string, baseUrl: string) {
  const base = new URL(baseUrl, "http://localhost");
  const target = new URL(redirectUrl, base);
  if (target.origin !== base.origin) {
    throw new Error(`renderServer cannot follow external Next redirect "${target.href}".`);
  }

  return `${target.pathname}${target.search}${target.hash}`;
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
    getRedirectStatus(redirect);
    return destination;
  }
}

function resolveNextCustomRewrite(
  routeManifest: NextRequestRouteManifest,
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

function hasNextStaticRouteMatch(routeManifest: NextRequestRouteManifest, requestUrl: string) {
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

function hasNextRouteMatch(routeManifest: NextRequestRouteManifest, requestUrl: string) {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  return (
    routeManifest.pages.some((entry) => matchNextRoutePattern(entry.route, pathname)) ||
    routeManifest.routeHandlers.some((entry) => matchNextRoutePattern(entry.route, pathname))
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
