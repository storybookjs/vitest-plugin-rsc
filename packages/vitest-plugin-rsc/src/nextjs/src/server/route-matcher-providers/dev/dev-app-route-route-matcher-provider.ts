import { loadNextProjectConfig } from "../../../../config.ts";
import { createProjectRequire } from "../../../../plugin-utils.ts";
import { createNextDevDefaultFileReader } from "./helpers/file-reader/default-file-reader.ts";

export type NextRouteHandlerManifestBuildEntry = {
  route: string;
  appPath: string;
  routeFile: string;
};

// Mirror/adapt: Next.js dev app-route route matcher provider.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts#L16-L138
// Adaptation: Vitest asks the installed provider for matchers directly and
// converts its definitions to the Vite virtual route-handler manifest shape
// until route handlers have their own Edge route-module path.

// Begin adapted: Next.js dev app-route route matcher setup
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts#L16-L138
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts#L14-L52
// Adaptation: Return manifest entries for Vite virtual modules rather than
// AppRouteRouteMatcher instances.
export async function scanNextAppRouteHandlers(
  root: string,
  mode: string,
): Promise<NextRouteHandlerManifestBuildEntry[]> {
  const requireFromProject = createProjectRequire(root);
  const projectConfig = await loadNextProjectConfig(root, mode);
  const appDir = projectConfig.appDir;
  if (!appDir) return [];

  const { DevAppRouteRouteMatcherProvider } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.js");
  const { sortPageObjects } = requireFromProject(
    "next/dist/shared/lib/router/utils/sortable-routes.js",
  ) as typeof import("next/dist/shared/lib/router/utils/sortable-routes.js");

  const provider = new DevAppRouteRouteMatcherProvider(
    appDir,
    projectConfig.pageExtensions,
    createNextDevDefaultFileReader(root),
    false,
  );
  const matchers = await provider.matchers();

  const entries = matchers.map((matcher) => ({
    route: matcher.definition.pathname,
    appPath: matcher.definition.page,
    routeFile: matcher.definition.filename,
  }));

  return Array.from(sortPageObjects(entries, (entry) => entry.route));
}
// End adapted
