import type { FlightRouterState } from "next/dist/shared/lib/app-router-types";
import { createFlightRouterStateFromLoaderTree } from "next/dist/server/app-render/create-flight-router-state-from-loader-tree.js";
import { dynamicParamTypes } from "next/dist/server/app-render/get-short-dynamic-param-type.js";
import { getDynamicParam } from "next/dist/shared/lib/router/utils/get-dynamic-param.js";
import {
  getSegmentParam,
  isCatchAll,
} from "next/dist/shared/lib/router/utils/get-segment-param.js";
import { PAGE_SEGMENT_KEY } from "next/dist/shared/lib/segment.js";

const CHILDREN_PARALLEL_ROUTE_KEY = "children";
type DynamicParamType = keyof typeof dynamicParamTypes;

type NormalizedSegmentParam = {
  paramName: string;
  paramType: DynamicParamType;
};

type NextSegmentParam =
  | NormalizedSegmentParam
  | {
      param: string;
      type: DynamicParamType;
    };

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
  //
  // Version split:
  // - Next 16.0.x and 16.1.x expose the 3-argument signature:
  //   (loaderTree, getDynamicParamFromSegment, searchParams). Their dynamic
  //   param callback receives the current segment string.
  // - Next 16.2.x exposes the 4-argument signature:
  //   (loaderTree, hintTree, getDynamicParamFromSegment, searchParams). Its
  //   dynamic param callback receives the current loader-tree node. Component
  //   tests do not have build-time prefetch hints, so the hint tree is `null`.
  // - Next 16.3 canary expands that 4-argument shape with prefetch/cache
  //   booleans before the dynamic param callback. Component tests synthesize a
  //   dynamic per-test tree, so those build/runtime prerender switches are
  //   `false`.
  const loaderTree = createLoaderTree(routePattern, PAGE_SEGMENT_KEY);
  const getDynamicParamFromSegment = createGetDynamicParamFromSegment(routePattern, pathname);
  const searchParams = Object.fromEntries(new URLSearchParams(search));
  const createFlightRouterState =
    createFlightRouterStateFromLoaderTree as unknown as CreateFlightRouterStateFromLoaderTree;

  if (createFlightRouterState.length >= 8) {
    return createFlightRouterState(
      loaderTree,
      null,
      false,
      false,
      false,
      false,
      getDynamicParamFromSegment,
      searchParams,
    );
  }

  if (createFlightRouterState.length >= 4) {
    return createFlightRouterState(loaderTree, null, getDynamicParamFromSegment, searchParams);
  }

  return createFlightRouterState(loaderTree, getDynamicParamFromSegment, searchParams);
}

type CreateFlightRouterStateFromLoaderTree = {
  length: number;
  (...args: unknown[]): Promise<FlightRouterState>;
};

function canPatternMatchPath(patternSegs: string[], pathSegs: string[]) {
  const pathnamePatternSegs = patternSegs.filter((segment) => !isPathlessRouteSegment(segment));

  let pathIndex = 0;
  for (let patternIndex = 0; patternIndex < pathnamePatternSegs.length; patternIndex++) {
    const segment = pathnamePatternSegs[patternIndex]!;
    const segmentParam = getNormalizedSegmentParam(segment);
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
  // Next 16.0.x does not publish Next's private app route parser at
  // `next/dist/shared/lib/router/routes/app.js`. We only need the two pathless
  // App Router segment forms here, so keep this local instead of importing the
  // newer 16.1.x/16.2.x parser.
  return isRouteGroupSegment(segment) || isParallelRouteSegment(segment);
}

function isRouteGroupSegment(segment: string) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function isParallelRouteSegment(segment: string) {
  return segment.startsWith("@");
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

  return (segmentOrLoaderTree: string | [segment: string, ...rest: unknown[]]) => {
    // Begin copy: Next.js createGetDynamicParamFromSegment segment handling
    // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L574-L595
    // Adaptation: component tests derive `params` from the provided route
    // pattern/pathname instead of Next's full request matcher.
    // Version split: Next 16.0.x/16.1.x call this with a segment string, while
    // Next 16.2.x calls it with the loader-tree node.
    const segment =
      typeof segmentOrLoaderTree === "string" ? segmentOrLoaderTree : segmentOrLoaderTree[0];
    const segmentParam = getNormalizedSegmentParam(segment);
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

    const segmentParam = getNormalizedSegmentParam(patternSeg);
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

function getNormalizedSegmentParam(segment: string): NormalizedSegmentParam | null {
  const segmentParam = getSegmentParam(segment) as NextSegmentParam | null;
  if (!segmentParam) return null;

  // Version split: Next 16.0.x returns `{ param, type }`, while Next 16.1.x
  // and 16.2.x renamed those fields to `{ paramName, paramType }`.
  if ("paramName" in segmentParam) {
    return segmentParam;
  }

  return {
    paramName: segmentParam.param,
    paramType: segmentParam.type,
  };
}
