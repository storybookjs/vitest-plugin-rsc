import { createProjectRequire } from "../../../plugin-utils.ts";
import type { NextProjectConfig } from "../../../config.ts";
import type { NextRouteManifestBuildEntry } from "../../server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";

export type NextRouteStaticInfo = {
  runtime?: string;
  maxDuration?: number;
  preferredRegion?: string | string[];
  middleware?: unknown;
};

// Mirror/adapt: Next.js static info collection including app layouts.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/get-static-info-including-layouts.ts#L18-L98
// Adaptation: Vitest imports the installed collector directly when present and
// returns an empty static-info object for older supported Next installs that do
// not expose this helper.

// Begin adapted: Next.js getStaticInfoIncludingLayouts invocation
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/get-static-info-including-layouts.ts#L18-L98
// Adaptation: The route entry already came from Next dev route discovery, so
// this adapter only supplies the matching collector options for the page.
export async function loadNextRouteStaticInfo(
  root: string,
  projectConfig: NextProjectConfig,
  entry: NextRouteManifestBuildEntry,
): Promise<NextRouteStaticInfo> {
  const getStaticInfoIncludingLayouts = loadNextStaticInfoCollector(root);
  if (!getStaticInfoIncludingLayouts) return {};

  return await getStaticInfoIncludingLayouts({
    isInsideAppDir: true,
    pageExtensions: projectConfig.pageExtensions,
    pageFilePath: entry.pageFile,
    appDir: projectConfig.appDir,
    config: projectConfig.nextConfig,
    isDev: projectConfig.isDev,
    page: entry.appPath,
  });
}

function loadNextStaticInfoCollector(root: string) {
  try {
    const { getStaticInfoIncludingLayouts } = createProjectRequire(root)(
      "next/dist/build/get-static-info-including-layouts.js",
    ) as {
      getStaticInfoIncludingLayouts(options: {
        isInsideAppDir: boolean;
        pageExtensions: string[];
        pageFilePath: string;
        appDir: string | undefined;
        config: NextProjectConfig["nextConfig"];
        isDev: boolean;
        page: string;
      }): Promise<NextRouteStaticInfo>;
    };
    return getStaticInfoIncludingLayouts;
  } catch (error) {
    if (!isModuleResolutionError(error)) throw error;
    return undefined;
  }
}

function isModuleResolutionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "MODULE_NOT_FOUND"
  );
}
// End adapted
