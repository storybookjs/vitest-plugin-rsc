import type { ResolveRoutesParams } from "@next/routing";

export type NextRoutingData = Pick<ResolveRoutesParams, "pathnames" | "routes">;
