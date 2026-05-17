import { loadNextProjectConfig } from "../../../../config.ts";
import { createProjectRequire } from "../../../../plugin-utils.ts";
import { createNextDevDefaultFileReader } from "./helpers/file-reader/default-file-reader.ts";

export type NextRouteManifestBuildEntry = {
  route: string;
  appDir: string;
  appPath: string;
  appPaths: readonly string[];
  allNormalizedAppPaths: readonly string[];
  pageFile: string;
};

// Mirror/adapt: Next.js dev app-page route matcher provider.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts#L10-L105
// Adaptation: Vitest asks the installed provider for matchers directly and
// converts its definitions to the Vite virtual route manifest shape instead of
// registering them with Next's dev server route matcher manager.

// Begin adapted: Next.js dev app-page route matcher setup
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts#L10-L105
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts#L14-L52
// Adaptation: Return manifest entries for Vite virtual modules rather than
// AppPageRouteMatcher instances.
export async function scanNextAppRoutes(
  root: string,
  mode: string,
): Promise<NextRouteManifestBuildEntry[]> {
  const requireFromProject = createProjectRequire(root);
  const projectConfig = await loadNextProjectConfig(root, mode);
  const appDir = projectConfig.appDir;
  if (!appDir) return [];

  const { DevAppPageRouteMatcherProvider } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js");
  const { sortPageObjects } = requireFromProject(
    "next/dist/shared/lib/router/utils/sortable-routes.js",
  ) as typeof import("next/dist/shared/lib/router/utils/sortable-routes.js");

  const provider = new DevAppPageRouteMatcherProvider(
    appDir,
    projectConfig.pageExtensions,
    createNextDevDefaultFileReader(root),
    false,
  );
  const matchers = await provider.matchers();

  const pageFileByAppPath = new Map<string, string>();
  const matcherByRoute = new Map<string, (typeof matchers)[number]>();

  for (const matcher of matchers) {
    pageFileByAppPath.set(matcher.definition.page, matcher.definition.filename);
    matcherByRoute.set(matcher.definition.pathname, matcher);
  }

  const entries = Array.from(matcherByRoute, ([route, matcher]) => {
    const appPath = matcher.definition.appPaths.at(-1) ?? matcher.definition.page;
    const pageFile = pageFileByAppPath.get(appPath) ?? matcher.definition.filename;

    return {
      route,
      appDir,
      appPath,
      appPaths: matcher.definition.appPaths,
      allNormalizedAppPaths: Array.from(matcherByRoute.keys()),
      pageFile,
    };
  });

  return Array.from(sortPageObjects(entries, (entry) => entry.route));
}
// End adapted
