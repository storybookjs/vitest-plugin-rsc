import type { FlightRouterState } from "next/dist/shared/lib/app-router-types";
import { createFlightRouterStateFromLoaderTree } from "next/dist/server/app-render/create-flight-router-state-from-loader-tree.js";
import { dynamicParamTypes } from "next/dist/server/app-render/get-short-dynamic-param-type.js";
import { getDynamicParam } from "next/dist/shared/lib/router/utils/get-dynamic-param.js";
import {
  getSegmentParam,
  isCatchAll,
} from "next/dist/shared/lib/router/utils/get-segment-param.js";
import { parseAppRouteSegment } from "next/dist/shared/lib/router/routes/app.js";
import { PAGE_SEGMENT_KEY } from "next/dist/shared/lib/segment.js";

const CHILDREN_PARALLEL_ROUTE_KEY = "children";

export async function buildFlightRouterStateWithNext(
  routePattern: string,
  pathname: string,
  search: string,
): Promise<FlightRouterState> {
  assertPatternMatchesPath(routePattern, pathname);

  // Reuse Next's exported loader-tree -> FlightRouterState function. We only
  // synthesize the minimal loader tree because component tests start from a
  // route pattern, not Next's next-app-loader output:
  // https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/create-flight-router-state-from-loader-tree.ts
  // This intentionally targets the published Next 16.2.x 4-argument signature.
  return createFlightRouterStateFromLoaderTree(
    createLoaderTree(routePattern, PAGE_SEGMENT_KEY),
    null,
    createGetDynamicParamFromSegment(routePattern, pathname),
    Object.fromEntries(new URLSearchParams(search)),
  );
}

function canPatternMatchPath(patternSegs: string[], pathSegs: string[]) {
  const pathnamePatternSegs = patternSegs.filter((segment) => !isPathlessRouteSegment(segment));

  let pathIndex = 0;
  for (let patternIndex = 0; patternIndex < pathnamePatternSegs.length; patternIndex++) {
    const segment = pathnamePatternSegs[patternIndex]!;
    const segmentParam = getSegmentParam(segment);
    if (segmentParam && isCatchAll(segmentParam.paramType)) {
      const remainingPatternSegments = pathnamePatternSegs.length - patternIndex - 1;
      if (remainingPatternSegments > 0) return false;

      return segmentParam.paramType === "optional-catchall"
        ? pathIndex <= pathSegs.length
        : pathIndex < pathSegs.length;
    }

    if (pathIndex >= pathSegs.length) return false;

    if (!segmentParam && segment !== decodePathSegment(pathSegs[pathIndex]!)) {
      return false;
    }

    pathIndex += 1;
  }

  return pathIndex === pathSegs.length;
}

function assertPatternMatchesPath(routePattern: string, pathname: string) {
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  const pathSegs = stripSlash(pathname).split("/").filter(Boolean);

  if (!canPatternMatchPath(patternSegs, pathSegs)) {
    throw new Error(`Pattern "${routePattern}" does not match pathname "${pathname}".`);
  }
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPathlessRouteSegment(segment: string) {
  // Keep this aligned with Next's app route parsing: route groups and parallel
  // route markers exist in the loader tree but do not consume URL path depth.
  const parsedSegment = parseAppRouteSegment(segment);
  return parsedSegment?.type === "route-group" || parsedSegment?.type === "parallel-route";
}

function createLoaderTree(routePattern: string, pageSegmentKey: string) {
  // Begin copy: Next.js LoaderTree tuple shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/lib/app-dir-module.ts#L4-L29
  // Adaptation: component tests synthesize the minimal loader tree from a route
  // pattern instead of using next-app-loader output.
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  let child = [pageSegmentKey, {}, { page: [async () => ({}), ""] }, null] as never;

  for (let index = patternSegs.length - 1; index >= 0; index--) {
    child = [patternSegs[index], { [CHILDREN_PARALLEL_ROUTE_KEY]: child }, {}, null] as never;
  }

  const loaderTree = [
    "",
    { [CHILDREN_PARALLEL_ROUTE_KEY]: child },
    { layout: [async () => ({}), ""] },
    null,
  ] as never;
  // End copy
  return loaderTree;
}

function createGetDynamicParamFromSegment(routePattern: string, pathname: string) {
  const params = createRouteParams(routePattern, pathname);

  return (loaderTree: [segment: string, ...rest: unknown[]]) => {
    // Begin copy: Next.js createGetDynamicParamFromSegment segment handling
    // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L574-L595
    // Adaptation: component tests derive `params` from the provided route
    // pattern/pathname instead of Next's full request matcher.
    const segmentParam = getSegmentParam(loaderTree[0]);
    if (!segmentParam) return null;

    return getDynamicParam(
      params,
      segmentParam.paramName,
      dynamicParamTypes[segmentParam.paramType],
      null,
      null,
    );
    // End copy
  };
}

function createRouteParams(routePattern: string, pathname: string) {
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  const pathSegs = stripSlash(pathname).split("/").filter(Boolean);
  const params: Record<string, string | string[]> = {};

  let pathIndex = 0;
  for (const patternSeg of patternSegs) {
    if (isPathlessRouteSegment(patternSeg)) continue;

    const segmentParam = getSegmentParam(patternSeg);
    if (!segmentParam) {
      pathIndex += 1;
      continue;
    }

    if (isCatchAll(segmentParam.paramType)) {
      params[segmentParam.paramName] = pathSegs.slice(pathIndex).map(decodePathSegment);
      pathIndex = pathSegs.length;
      continue;
    }

    params[segmentParam.paramName] = decodePathSegment(pathSegs[pathIndex]!);
    pathIndex += 1;
  }

  return params;
}
