import type { AppRouteUserlandModule } from "next/dist/server/route-modules/app-route/module.compiled.js";
import type { NextConfig } from "next/dist/server/config-shared.js";

export type InvokeNextRouteHandlerOptions = {
  userland?: Record<string, unknown>;
  getUserland?: () => Promise<Record<string, unknown>>;
  route: string;
  url: string;
  appPath?: string;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  request?: Request;
  params?: Record<string, string | string[] | undefined>;
  nextConfigOutput?: NextConfig["output"];
};

export async function invokeNextRouteHandler({
  userland: providedUserland,
  getUserland,
  route,
  url,
  appPath = createAppRoutePath(route),
  method = "GET",
  headers,
  body,
  request,
  params,
  nextConfigOutput,
}: InvokeNextRouteHandlerOptions): Promise<Response> {
  const nodeEnvironmentBaseline = "next/dist/server/node-environment-baseline.js";
  await import(nodeEnvironmentBaseline);
  const [{ AppRouteRouteModule }, { defaultConfig }, { NextRequest }, { getEdgePreviewProps }] =
    await Promise.all([
      import("next/dist/server/route-modules/app-route/module.compiled.js"),
      import("next/dist/server/config-shared.js"),
      import("next/dist/server/web/spec-extension/request.js"),
      import("next/dist/server/web/get-edge-preview-props.js"),
    ]);
  const userland = providedUserland ?? (await getUserland?.());
  if (!userland) {
    throw new Error("invokeNextRouteHandler requires userland or getUserland.");
  }

  const routeModule = new AppRouteRouteModule({
    definition: {
      kind: "APP_ROUTE" as never,
      page: appPath,
      pathname: route,
      filename: "",
      bundlePath: "",
    },
    distDir: "",
    relativeProjectDir: "",
    resolvedPagePath: appPath,
    nextConfigOutput,
    userland: userland as AppRouteUserlandModule,
  });
  const nextRequest = new NextRequest(
    request ??
      new Request(new URL(url, "http://localhost"), {
        body,
        headers,
        method,
      }),
  );
  const closeCallbacks = new Set<() => void>();
  const waitUntilPromises = new Set<Promise<unknown>>();

  try {
    return await routeModule.handle(nextRequest, {
      params,
      previewProps: getEdgePreviewProps(),
      renderOpts: {
        supportsDynamicResponse: true,
        waitUntil(promise) {
          waitUntilPromises.add(Promise.resolve(promise));
        },
        onClose(callback) {
          closeCallbacks.add(callback);
        },
        onAfterTaskError(error) {
          console.error(error);
        },
        cacheComponents: false,
        experimental: {
          authInterrupts: false,
        },
        cacheLifeProfiles: defaultConfig.cacheLife,
      },
      sharedContext: {
        buildId: "",
        deploymentId: "",
      },
    });
  } finally {
    for (const callback of closeCallbacks) {
      callback();
    }
    await Promise.allSettled(waitUntilPromises);
  }
}

function createAppRoutePath(route: string) {
  const withLeadingSlash = route.startsWith("/") ? route : `/${route}`;
  const normalized = withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/$/, "");
  return `${normalized}/route`;
}
