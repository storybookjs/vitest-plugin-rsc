import type { ResolveRoutesParams } from "@next/routing";

export const nextRoutingBuildId = "BUILD_ID";

export type NextRoutingData = Pick<
  ResolveRoutesParams,
  "basePath" | "buildId" | "i18n" | "pathnames" | "routes"
>;
