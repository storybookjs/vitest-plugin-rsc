import type { FlightRouterState } from "next/dist/shared/lib/app-router-types";
import { dynamicParamTypes } from "next/dist/server/app-render/get-short-dynamic-param-type.js";
import { getDynamicParam } from "next/dist/shared/lib/router/utils/get-dynamic-param.js";
import {
  getSegmentParam,
  isCatchAll,
} from "next/dist/shared/lib/router/utils/get-segment-param.js";

const CHILDREN_PARALLEL_ROUTE_KEY = "children";

export async function buildFlightRouterStateWithNext(
  routePattern: string,
  pathname: string,
  search: string,
): Promise<FlightRouterState> {
  assertPatternMatchesPath(routePattern, pathname);

  const [{ createFlightRouterStateFromLoaderTree }, { PAGE_SEGMENT_KEY }] = await Promise.all([
    import("next/dist/server/app-render/create-flight-router-state-from-loader-tree.js"),
    import("next/dist/shared/lib/segment.js"),
  ]);

  // Reuse Next's exported loader-tree -> FlightRouterState function. We only
  // synthesize the minimal loader tree because component tests start from a
  // route pattern, not Next's next-app-loader output:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/create-flight-router-state-from-loader-tree.ts
  return createFlightRouterStateFromLoaderTree(
    createLoaderTree(routePattern, PAGE_SEGMENT_KEY),
    null,
    createGetDynamicParamFromSegment(routePattern, pathname),
    Object.fromEntries(new URLSearchParams(search)),
  );
}

function canPatternMatchPath(patternSegs: string[], pathSegs: string[]) {
  const catchAllIndex = patternSegs.findIndex((segment) => {
    const segmentParam = getSegmentParam(segment);
    return segmentParam && isCatchAll(segmentParam.paramType);
  });

  if (catchAllIndex === -1) {
    return patternSegs.length === pathSegs.length;
  }

  const catchAllParam = getSegmentParam(patternSegs[catchAllIndex]!);
  return catchAllParam?.paramType === "optional-catchall"
    ? catchAllIndex <= pathSegs.length
    : catchAllIndex < pathSegs.length;
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

function createLoaderTree(routePattern: string, pageSegmentKey: string) {
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  let child = [pageSegmentKey, {}, { page: [async () => ({}), ""] }, null] as never;

  for (let index = patternSegs.length - 1; index >= 0; index--) {
    child = [patternSegs[index], { [CHILDREN_PARALLEL_ROUTE_KEY]: child }, {}, null] as never;
  }

  return [
    "",
    { [CHILDREN_PARALLEL_ROUTE_KEY]: child },
    { layout: [async () => ({}), ""] },
    null,
  ] as never;
}

function createGetDynamicParamFromSegment(routePattern: string, pathname: string) {
  const params = createRouteParams(routePattern, pathname);

  return (loaderTree: [segment: string, ...rest: unknown[]]) => {
    const segmentParam = getSegmentParam(loaderTree[0]);
    if (!segmentParam) return null;

    return getDynamicParam(
      params,
      segmentParam.paramName,
      dynamicParamTypes[segmentParam.paramType],
      null,
      null,
    );
  };
}

function createRouteParams(routePattern: string, pathname: string) {
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  const pathSegs = stripSlash(pathname).split("/").filter(Boolean);
  const params: Record<string, string | string[]> = {};

  for (let index = 0; index < patternSegs.length; index++) {
    const segmentParam = getSegmentParam(patternSegs[index]!);
    if (!segmentParam) continue;

    params[segmentParam.paramName] = isCatchAll(segmentParam.paramType)
      ? pathSegs.slice(index).map(decodePathSegment)
      : decodePathSegment(pathSegs[index]!);
  }

  return params;
}
