import type { FlightRouterState } from "next/dist/shared/lib/app-router-types";

type ParamSegment = [
  param: string,
  value: string,
  type: "d",
  staticSiblings: readonly string[] | null,
];
type Segment = string | ParamSegment;
const ROOT_LAYOUT_PREFETCH_HINT = 16;

export function buildFlightRouterState(
  routePattern: string,
  pathname: string,
  search: string,
): FlightRouterState {
  /* ── helpers ───────────────────────────────────────────────────────────── */
  const stripSlash = (s: string) => s.replace(/^\/|\/$/g, "");
  const isDynamic = (seg: string) => /^\[.+]$/.test(seg);

  const patternSegs = stripSlash(routePattern).split("/").filter(Boolean);
  const pathSegs = stripSlash(pathname).split("/").filter(Boolean);

  if (patternSegs.length !== pathSegs.length) {
    throw new Error(`Pattern “${routePattern}” does not match pathname “${pathname}”.`);
  }

  /* ── page-leaf creator ─────────────────────────────────────────────────── */
  const queryObj = Object.fromEntries(new URLSearchParams(search));
  const querySuffix = Object.keys(queryObj).length === 0 ? "" : `?${JSON.stringify(queryObj)}`;

  const makePageState = (): FlightRouterState => ["__PAGE__" + querySuffix, {}, null, null];

  /* ── recursive descent over segments ───────────────────────────────────── */
  const descend = (idx: number, accPath: string): FlightRouterState => {
    if (idx >= patternSegs.length) {
      // All segments consumed ⇒ we’re at the page leaf
      return makePageState();
    }

    const patternSeg = patternSegs[idx]!;
    const pathSeg = pathSegs[idx]!;
    const nextAcc = `${accPath}/${pathSeg}`;

    const segment: Segment = isDynamic(patternSeg)
      ? [patternSeg.slice(1, -1), pathSeg, "d", null]
      : patternSeg;

    return [segment, { children: descend(idx + 1, nextAcc) }];
  };

  /* ── root wrapper ──────────────────────────────────────────────────────── */
  const childState = patternSegs.length === 0 ? makePageState() : descend(0, "");

  return ["", { children: childState }, null, null, ROOT_LAYOUT_PREFETCH_HINT];
}
