import { ACTION_HEADER, RSC_HEADER } from "next/dist/client/components/app-router-headers.js";
import {
  resolveNextRequestTarget,
  resolveRedirectUrl,
  type NextEdgeAppPageModule,
  type NextEdgeAppRouteModule,
  type NextRequestTarget,
  type NextRouteManifest,
} from "../../request-router.ts";
import { importReactSsr } from "../../../utilts.ts";
import { installNextEdgeAppPageManifests } from "../build/templates/edge-ssr-app.ts";
import {
  createNextServerActionManifest,
  emptyServerActionsManifest,
} from "../build/webpack/plugins/flight-client-entry-plugin.ts";
import { htmlClientReferenceManifest } from "../build/webpack/plugins/flight-manifest-plugin.ts";
import { setNextRenderManifests } from "./app-render/manifests-singleton.ts";

type NextAppPageTarget = Extract<NextRequestTarget, { kind: "app-page" }>;
type NextAppRouteTarget = Extract<NextRequestTarget, { kind: "app-route" }>;
type NextRedirectTarget = Extract<NextRequestTarget, { kind: "redirect" }>;
type NextAppPageRscGetDispatchRequest = Request;
type NextAppPageActionPostDispatchRequest = Request;
const maxInitialRenderRedirects = 5;

// Begin adapted: Next.js Edge App Page request dispatch
// Source: NextServer.renderPageComponent
// https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/next-server.ts#L767-L798
// Source: NextServer.getEdgeFunctionsPages
// https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/next-server.ts#L1471-L1478
// Source: NextServer.runEdgeFunction
// https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/next-server.ts#L1981-L2108
// Source: Next.js Edge SSR App template
// https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-ssr-app.ts
// Adaptation: Vitest owns the route manifest and runs generated Edge App
// Page modules through Vite instead of Next's Node server, middleware manifest,
// and web sandbox. Keep Next's page selection and edge request shape while
// returning a Web Response to the initial render and MSW-backed browser runtime.
// The generated edge-ssr-app handler delegates rendering to AppPageRouteModule.
type NextAppPageEdgeDispatchRequest = {
  url: string;
  headers?: Headers | Record<string, string>;
};

type NextAppPageInitialRenderDispatchRequest =
  | Request
  | {
      url: string;
      headers?: Headers | Record<string, string>;
    };

type NextAppPageInitialRenderMode = "flight" | "html";

type NextAppPageEdgeDispatchSelection =
  | {
      kind: "edge-app-page";
      target: NextAppPageTarget;
      request: Request;
      load: () => Promise<NextEdgeAppPageModule>;
    }
  | {
      kind: "unhandled";
      target: Exclude<NextRequestTarget, { kind: "app-page" | "redirect" }>;
    }
  | {
      kind: "redirect";
      target: NextRedirectTarget;
    };

export type NextAppPageRscGetDispatchSelection = NextAppPageEdgeDispatchSelection;
export type NextAppPageActionPostDispatchSelection = NextAppPageEdgeDispatchSelection;
export type NextAppPageInitialRenderDispatchSelection = NextAppPageEdgeDispatchSelection;
type NextAppPageSelectedEdgeDispatch = Extract<
  NextAppPageEdgeDispatchSelection,
  { kind: "edge-app-page" }
>;

type NextAppRouteDispatchSelection =
  | {
      kind: "edge-app-route";
      target: NextAppRouteTarget;
      request: Request;
      load: () => Promise<NextEdgeAppRouteModule>;
    }
  | {
      kind: "unhandled";
      target: Exclude<NextRequestTarget, { kind: "app-route" | "redirect" }>;
    }
  | {
      kind: "redirect";
      target: NextRedirectTarget;
    };

export type NextAppRouteRequestDispatchSelection = NextAppRouteDispatchSelection;
type NextAppRouteSelectedEdgeDispatch = Extract<
  NextAppRouteDispatchSelection,
  { kind: "edge-app-route" }
>;

export async function resolveNextAppPageRscGetDispatch(options: {
  request: NextAppPageRscGetDispatchRequest;
  manifest: NextRouteManifest;
}): Promise<NextAppPageRscGetDispatchSelection> {
  return resolveNextAppPageEdgeDispatch({
    request: options.request,
    manifest: options.manifest,
    dispatchName: "Next App Page RSC GET",
    createRequest: (target) => createEdgeAppPageRequest(options.request, target, { flight: true }),
  });
}

export async function resolveNextAppPageInitialRenderDispatch(options: {
  request: NextAppPageInitialRenderDispatchRequest;
  manifest: NextRouteManifest;
  mode: NextAppPageInitialRenderMode;
}): Promise<NextAppPageInitialRenderDispatchSelection> {
  const request = createInitialRenderRequest(options.request);
  return resolveNextAppPageEdgeDispatch({
    request,
    manifest: options.manifest,
    dispatchName: `Next App Page initial ${options.mode}`,
    createRequest: (target) =>
      createEdgeAppPageRequest(request, target, { flight: options.mode === "flight" }),
  });
}

export async function resolveNextAppPageActionPostDispatch(options: {
  request: NextAppPageActionPostDispatchRequest;
  manifest: NextRouteManifest;
}): Promise<NextAppPageActionPostDispatchSelection> {
  return resolveNextAppPageEdgeDispatch({
    request: options.request,
    manifest: options.manifest,
    dispatchName: "Next App Page Server Action POST",
    createRequest: (target) => createEdgeAppPageActionPostRequest(options.request, target),
  });
}

export async function dispatchNextAppPageRscGet(options: {
  request: NextAppPageRscGetDispatchRequest;
  manifest: NextRouteManifest;
}): Promise<Response | undefined> {
  const selection = await resolveNextAppPageRscGetDispatch(options);
  return dispatchNextAppPageEdgeSelection(selection);
}

export async function dispatchNextAppPageActionPost(options: {
  request: NextAppPageActionPostDispatchRequest;
  manifest: NextRouteManifest;
}): Promise<Response | undefined> {
  const selection = await resolveNextAppPageActionPostDispatch(options);
  return dispatchNextAppPageEdgeSelection(selection);
}

export async function dispatchNextAppPageInitialRender(options: {
  request: NextAppPageInitialRenderDispatchRequest;
  manifest: NextRouteManifest;
  mode: NextAppPageInitialRenderMode;
}): Promise<Response | undefined> {
  const selection = await resolveNextAppPageInitialRenderDispatch(options);
  return dispatchNextAppPageEdgeSelection(selection);
}

export async function readNextAppPageInitialDocumentHtml(options: {
  request: NextAppPageInitialRenderDispatchRequest;
  manifest: NextRouteManifest;
}): Promise<string | undefined> {
  const document = await readNextAppPageInitialDocument(options);
  return document?.html;
}

export async function readNextAppPageInitialDocument(options: {
  request: NextAppPageInitialRenderDispatchRequest;
  manifest: NextRouteManifest;
}): Promise<{ html: string; url: string } | undefined> {
  let request = createInitialRenderRequest(options.request);

  for (let redirectCount = 0; redirectCount < maxInitialRenderRedirects; redirectCount++) {
    const response = await dispatchNextAppPageInitialRender({
      request,
      manifest: options.manifest,
      mode: "html",
    });
    if (!response) return;
    if (!isRedirectResponse(response)) {
      return { html: await response.text(), url: formatInitialRenderUrl(request.url) };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(
        `Next Edge App Page initial render returned ${response.status} without Location.`,
      );
    }
    request = {
      ...request,
      url: resolveRedirectUrl(location, request.url),
    };
  }

  throw new Error(
    `renderServer exceeded the Next initial render redirect limit for ${request.url}.`,
  );
}

// Additional adapted source: Next.js Edge App Route request dispatch
// Source: NextServer.runEdgeFunction
// https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/next-server.ts#L1981-L2108
// Source: Next.js Edge App Route template
// https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-app-route.ts
// Source: Next.js EdgeRouteModuleWrapper
// https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/web/edge-route-module-wrapper.ts#L61-L165
// Adaptation: Vitest owns the route manifest and Vite module loading. Matched
// App Route requests still enter the generated edge-app-route handler, which
// wraps AppRouteRouteModule.handle() through EdgeRouteModuleWrapper.
export async function resolveNextAppRouteRequestDispatch(options: {
  request: Request;
  manifest: NextRouteManifest;
}): Promise<NextAppRouteRequestDispatchSelection> {
  const target = await resolveNextRequestTarget({
    url: options.request.url,
    headers: options.request.headers,
    manifest: options.manifest,
  });

  if (target.kind === "redirect") {
    return { kind: "redirect", target };
  }

  if (target.kind !== "app-route") {
    return { kind: "unhandled", target };
  }

  const load = target.entry.edgeAppRoute;
  if (!load) {
    throw new Error(
      `Next App Route request for "${target.entry.appPath}" resolved without a generated Edge App Route handler. The next-routes virtual manifest must provide edgeAppRoute for App Route entries.`,
    );
  }

  return {
    kind: "edge-app-route",
    target,
    request: createEdgeAppRouteRequest(options.request, target),
    load,
  };
}

export async function dispatchNextAppRouteRequest(options: {
  request: Request;
  manifest: NextRouteManifest;
}): Promise<Response | undefined> {
  const selection = await resolveNextAppRouteRequestDispatch(options);
  return dispatchNextAppRouteSelection(selection);
}

async function resolveNextAppPageEdgeDispatch(options: {
  request: NextAppPageEdgeDispatchRequest;
  manifest: NextRouteManifest;
  dispatchName: string;
  createRequest: (target: NextAppPageTarget) => Request;
}): Promise<NextAppPageEdgeDispatchSelection> {
  const target = await resolveNextRequestTarget({
    url: options.request.url,
    headers: options.request.headers,
    manifest: options.manifest,
  });

  if (target.kind === "redirect") {
    return { kind: "redirect", target };
  }

  if (target.kind !== "app-page") {
    return { kind: "unhandled", target };
  }

  const load = target.entry.edgeAppPage;
  if (!load) {
    throw new Error(
      `${options.dispatchName} for "${target.entry.appPath}" resolved without a generated Edge App Page handler. The next-routes virtual manifest must provide edgeAppPage for App Page entries.`,
    );
  }

  return {
    kind: "edge-app-page",
    target,
    request: options.createRequest(target),
    load,
  };
}

async function dispatchNextAppPageEdgeSelection(
  selection: NextAppPageEdgeDispatchSelection,
): Promise<Response | undefined> {
  if (selection.kind === "redirect") return createRedirectResponse(selection.target);
  if (selection.kind !== "edge-app-page") return;

  const manifests = createNextEdgeAppPageManifests(selection);
  installNextEdgeAppPageManifests(selection.target.entry.appPath, manifests);
  const { handler } = await loadNextEdgeAppPageModule(selection);
  await setNextRenderManifests({
    page: selection.target.entry.appPath,
    clientReferenceManifest: manifests.clientReferenceManifest,
    serverActionsManifest: manifests.serverActionsManifest,
  });
  return handler(selection.request, createEdgeHandlerContext());
}

function loadNextEdgeAppPageModule(selection: NextAppPageSelectedEdgeDispatch) {
  const edgeAppPageSource = selection.target.entry.edgeAppPageSource;
  if (edgeAppPageSource) {
    return importReactSsr<NextEdgeAppPageModule>(edgeAppPageSource);
  }

  return selection.load();
}

async function dispatchNextAppRouteSelection(
  selection: NextAppRouteDispatchSelection,
): Promise<Response | undefined> {
  if (selection.kind === "redirect") return createRedirectResponse(selection.target);
  if (selection.kind !== "edge-app-route") return;

  installNextEdgeAppPageManifests(selection.target.entry.appPath, {
    clientReferenceManifest: htmlClientReferenceManifest,
    serverActionsManifest: emptyServerActionsManifest,
  });
  const { handler } = await loadNextEdgeAppRouteModule(selection);
  return handler(selection.request, createEdgeHandlerContext());
}

function loadNextEdgeAppRouteModule(selection: NextAppRouteSelectedEdgeDispatch) {
  const edgeAppRouteSource = selection.target.entry.edgeAppRouteSource;
  if (edgeAppRouteSource) {
    return importReactSsr<NextEdgeAppRouteModule>(edgeAppRouteSource);
  }

  return selection.load();
}

function createNextEdgeAppPageManifests(selection: NextAppPageSelectedEdgeDispatch) {
  const actionId = selection.request.headers.get(ACTION_HEADER);
  return {
    clientReferenceManifest: htmlClientReferenceManifest,
    serverActionsManifest: actionId
      ? createNextServerActionManifest(actionId, selection.target.entry.appPath)
      : emptyServerActionsManifest,
  };
}

function createRedirectResponse(target: NextRedirectTarget) {
  const headers = new Headers(target.responseHeaders);
  if (!headers.has("location")) {
    headers.set("location", target.url.href);
  }
  return new Response(null, {
    headers,
    status: target.status,
  });
}

function createInitialRenderRequest(
  request: NextAppPageInitialRenderDispatchRequest,
): NextAppPageEdgeDispatchRequest {
  return {
    url: request.url,
    headers: "headers" in request && request.headers ? new Headers(request.headers) : undefined,
  };
}

function createEdgeAppPageRequest(
  request: NextAppPageEdgeDispatchRequest,
  target: NextAppPageTarget,
  options: { flight: boolean },
) {
  const headers = new Headers(request.headers);
  if (options.flight) {
    headers.set(RSC_HEADER, "1");
  } else {
    headers.delete(RSC_HEADER);
  }

  return new Request(target.invocationUrl, {
    method: "GET",
    headers,
  });
}

function createEdgeAppPageActionPostRequest(request: Request, target: NextAppPageTarget) {
  const headers = new Headers(request.headers);
  const host = new URL(target.invocationUrl).host;
  if (!headers.has("host")) {
    headers.set("host", host);
  }
  if (!headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", host);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: request.body,
    duplex: request.body ? "half" : undefined,
  };
  return new Request(target.invocationUrl, init);
}

function createEdgeAppRouteRequest(request: Request, target: NextAppRouteTarget) {
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    duplex: request.body ? "half" : undefined,
  };
  return new Request(createEdgeAppRouteInvocationUrl(target), init);
}

function createEdgeAppRouteInvocationUrl(target: NextAppRouteTarget) {
  const url = new URL(target.invocationUrl);
  for (const [key, value] of Object.entries(target.routeMatches)) {
    url.searchParams.delete(key);
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function createEdgeHandlerContext() {
  return {
    waitUntil(promise: Promise<unknown>) {
      void promise.catch(() => {});
    },
    requestMeta: {},
    signal: new AbortController().signal,
  };
}

function isRedirectResponse(response: Response) {
  return response.status >= 300 && response.status < 400;
}

function formatInitialRenderUrl(url: string) {
  const parsed = new URL(url, "http://localhost");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
// End adapted
