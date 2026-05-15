import {
  AppRouteRouteModule,
  type AppRouteUserlandModule,
} from "next/dist/server/route-modules/app-route/module.js";
import { defaultConfig, type NextConfig } from "next/dist/server/config-shared.js";
import { NextRequest } from "next/dist/server/web/spec-extension/request.js";
import { getEdgePreviewProps } from "next/dist/server/web/get-edge-preview-props.js";

export type InvokeNextRouteHandlerOptions = {
  userland: Record<string, unknown>;
  route: string;
  url: string;
  appPath?: string;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  params?: Record<string, string | string[] | undefined>;
  nextConfigOutput?: NextConfig["output"];
};

export async function invokeNextRouteHandler({
  userland,
  route,
  url,
  appPath = createAppRoutePath(route),
  method = "GET",
  headers,
  body,
  params,
  nextConfigOutput,
}: InvokeNextRouteHandlerOptions): Promise<Response> {
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
  const request = new NextRequest(
    new Request(new URL(url, "http://localhost"), {
      body,
      headers,
      method,
    }),
  );
  const closeCallbacks = new Set<() => void>();
  const waitUntilPromises = new Set<Promise<unknown>>();

  try {
    return await routeModule.handle(request, {
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
