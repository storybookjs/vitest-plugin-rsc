import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/app-page.ts#L118-L150
// Adaptation: Vitest creates the route module object directly because Vite
// already loaded the app tree through virtual modules.
// Begin adapted: Next.js AppPageRouteModule definition shape
export function createAppPageRouteModule({
  route,
  page,
  loaderTree,
}: {
  route: string;
  page: string;
  loaderTree: LoaderTree;
}) {
  return {
    definition: {
      kind: "APP_PAGE",
      page,
      pathname: route,
      bundlePath: "",
      filename: "",
      appPaths: [page],
    },
    userland: {
      loaderTree,
    },
  };
}
// End adapted
