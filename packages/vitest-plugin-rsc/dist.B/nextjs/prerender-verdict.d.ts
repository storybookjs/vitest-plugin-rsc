import { n as PrerenderVerdict } from "../registry-DSqmGFo0.js";
import { buildAppStaticPaths } from "next/dist/build/static-paths/app.js";
//#region src/nextjs/prerender-verdict.d.ts
type RouteEntry = Parameters<typeof buildAppStaticPaths>[0]["ComponentMod"];
declare function prerenderVerdictOf(entry: RouteEntry, pathname: string, kind: "page" | "route"): Promise<PrerenderVerdict | undefined>;
//#endregion
export { prerenderVerdictOf };