import "next/dist/server/node-environment-baseline";
import {
  NEXT_ACTION_NOT_FOUND_HEADER,
  RSC_CONTENT_TYPE_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import {
  getRedirectTypeFromError,
  getURLFromRedirectError,
} from "next/dist/client/components/redirect.js";
import { isRedirectError } from "next/dist/client/components/redirect-error.js";
import { RedirectStatusCode } from "next/dist/client/components/redirect-status-code.js";
import {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from "next/dist/client/components/http-access-fallback/http-access-fallback.js";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { Container } from "react-dom/client";
import type { JSXElementConstructor, ReactNode } from "react";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  type RenderConfiguration,
} from "../testing-library";
import type { FetchRsc, RscPayload, TestingLibraryClientRoot } from "../testing-library-client";
import { importReactClient } from "../utilts";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import { NextRouter } from "vitest-plugin-rsc/nextjs/client";
import { createNextActionResponse, createNextRouteResponse } from "./flight-payload";
import { buildFlightRouterStateWithNext } from "./flight-router-state";
import { createSeedDataFromFlightRouterState } from "./flight-seed-data";
import { createNextRequestContext, resetNextRequestContextCache } from "./request-context";
import type { FetchNextRsc } from "./testing-library-client";

export * from "../testing-library";

export type NextRenderConfiguration = Partial<RenderConfiguration> & {
  nextRscRequestsViaMsw?: boolean;
};

type NextRuntimeConfiguration = RenderConfiguration & {
  nextRscRequestsViaMsw: boolean;
};

const client = await importReactClient<typeof import("../testing-library-client")>(
  "vitest-plugin-rsc/testing-library-client",
);
const nextClient = await importReactClient<typeof import("./testing-library-client")>(
  "vitest-plugin-rsc/nextjs/testing-library-client",
);

const mountedContainers = new Set<Container>();
const mountedRootEntries: {
  container: Container;
  root: TestingLibraryClientRoot;
}[] = [];

let config: NextRuntimeConfiguration = {
  reactStrictMode: false,
  rootOptions: {},
  nextRscRequestsViaMsw: false,
};

export function initialize(customConfig: NextRenderConfiguration = {}): void {
  config = {
    ...config,
    ...customConfig,
    rootOptions: {
      onCaughtError: (error) => {
        if (isNextRouterError(error)) return;
        console.log(error);
      },
      ...(customConfig.rootOptions ?? {}),
    },
  };
  baseInitialize(toBaseConfig());
}

type NextRenderServerOptions = {
  container?: HTMLElement;
  baseElement?: HTMLElement;
  wrapper?: JSXElementConstructor<{ children: ReactNode }>;
  url?: string;
  route?: string;
  headers?: Headers | Record<string, string>;
};

export async function renderServer(
  ui: ReactNode,
  {
    container,
    baseElement = document.body,
    wrapper: WrapperComponent,
    url,
    route,
    headers,
  }: NextRenderServerOptions = {},
): Promise<{
  container: HTMLElement;
  baseElement: HTMLElement;
  unmount: () => Promise<void>;
  rerender: (ui: ReactNode) => Promise<void>;
  asFragment: () => DocumentFragment;
}> {
  container ??= baseElement.appendChild(document.createElement("div"));

  let root: TestingLibraryClientRoot;

  if (!mountedContainers.has(container)) {
    const requestUrl = url ?? "/";
    const requestRoute = route ?? new URL(requestUrl, "http://localhost").pathname;
    const requestContext = await createNextRequestContext({
      url: requestUrl,
      route: requestRoute,
      headers,
    });

    async function prepareServerRoot(): Promise<ReactNode> {
      let serverRoot = ui;
      if (WrapperComponent) {
        serverRoot = <WrapperComponent>{ui}</WrapperComponent>;
      }
      return createNextRouterInitialTree(serverRoot, requestUrl, requestRoute);
    }

    const fetchRsc: FetchRsc = async (actionRequest) => {
      let returnValue: unknown | undefined;
      let temporaryReferences: unknown | undefined;
      if (actionRequest) {
        const { id, reply } = actionRequest;
        temporaryReferences = ReactServer.createTemporaryReferenceSet();
        const args = await ReactServer.decodeReply(reply, {
          temporaryReferences,
        });
        const action = await ReactServer.loadServerAction(id);
        returnValue = await requestContext.run("action", () => action.apply(null, args));
      }
      const rscPayload: RscPayload = {
        root: await prepareServerRoot(),
        returnValue,
      };
      const rscOptions = { temporaryReferences };
      return requestContext.run(actionRequest ? "action-render" : "render", () =>
        ReactServer.renderToReadableStream<RscPayload>(rscPayload, rscOptions),
      );
    };

    const fetchNextRsc: FetchNextRsc = async (request) => {
      if (request.requestType === "next-action") {
        let returnValue: unknown | undefined;
        const temporaryReferences = ReactServer.createTemporaryReferenceSet();
        const action = await loadNextServerAction(request.id);
        if (!action) {
          return new Response("Server action not found.", {
            status: 404,
            headers: {
              [NEXT_ACTION_NOT_FOUND_HEADER]: "1",
              "content-type": "text/plain",
            },
          });
        }
        const args = await ReactServer.decodeReply(request.reply, { temporaryReferences });
        try {
          returnValue = await requestContext.run("action", () => action.apply(null, args));
        } catch (error) {
          if (isRedirectError(error)) {
            const actionResult = await requestContext.completeAction({ forceRender: true });
            const responseHeaders = new Headers(actionResult.headers);
            responseHeaders.set(
              "x-action-redirect",
              `${getURLFromRedirectError(error)};${getRedirectTypeFromError(error)}`,
            );
            return new Response(null, {
              status: RedirectStatusCode.SeeOther,
              headers: responseHeaders,
            });
          }

          // Match Next's action response shape by serializing the thrown value as
          // a rejected action result instead of turning the POST into a plain 500.
          returnValue = createHandledRejectedPromise(error);
          if (isHTTPAccessFallbackError(error)) {
            const actionResult = await requestContext.completeAction({ forceRender: true });
            const actionResponse = await createNextActionResponse(
              await prepareServerRoot(),
              returnValue,
              true,
              request.routerState,
            );
            const stream = await requestContext.run("action-render", () =>
              ReactServer.renderToReadableStream(actionResponse, { temporaryReferences }),
            );
            const responseHeaders = new Headers(actionResult.headers);
            responseHeaders.set("content-type", RSC_CONTENT_TYPE_HEADER);
            return new Response(stream, {
              status: getAccessFallbackHTTPStatus(error),
              headers: responseHeaders,
            });
          }
        }
        const actionResult = await requestContext.completeAction();
        const actionResponse = await createNextActionResponse(
          await prepareServerRoot(),
          returnValue,
          actionResult.shouldRender,
          request.routerState,
        );
        const stream = await requestContext.run("action-render", () =>
          ReactServer.renderToReadableStream(actionResponse, { temporaryReferences }),
        );
        const responseHeaders = new Headers(actionResult.headers);
        responseHeaders.set("content-type", RSC_CONTENT_TYPE_HEADER);
        return new Response(stream, {
          status: returnValue instanceof Promise ? 500 : 200,
          headers: responseHeaders,
        });
      }

      const routeResponse = await createNextRouteResponse(
        await prepareServerRoot(),
        request.url,
        request.routerState,
      );
      const stream = await requestContext.run("render", () =>
        ReactServer.renderToReadableStream(routeResponse),
      );
      return new Response(stream, {
        headers: { "content-type": RSC_CONTENT_TYPE_HEADER },
      });
    };

    const serverActionCaller = config.nextRscRequestsViaMsw
      ? nextClient.createServerActionCaller({ fetchRsc: fetchNextRsc })
      : undefined;

    try {
      root = await client.createTestingLibraryClientRoot({
        container,
        config: toBaseConfig(),
        fetchRsc,
        serverActionCaller,
      });
    } catch (error) {
      serverActionCaller?.cleanup();
      throw error;
    }
    mountedRootEntries.push({ container, root });
    mountedContainers.add(container);
  } else {
    root = mountedRootEntries.find((it) => it.container === container)!.root;
  }

  return {
    container,
    baseElement,
    unmount: () => unmountRoot(container, false),
    rerender: async (newUi) => {
      ui = newUi;
      await root.rerender();
    },
    asFragment: () => {
      return document.createRange().createContextualFragment(container.innerHTML);
    },
  };
}

async function unmountRoot(container: Container, removeContainer: boolean) {
  const index = mountedRootEntries.findIndex((it) => it.container === container);
  if (index === -1) return;

  const entry = mountedRootEntries.splice(index, 1)[0];
  if (!entry) return;

  mountedContainers.delete(container);
  await entry.root.unmount();
  if (removeContainer && container.parentNode === document.body) {
    document.body.removeChild(container);
  }
}

function createHandledRejectedPromise(error: unknown): Promise<unknown> {
  const rejectedReturnValue = Promise.reject(error);
  void rejectedReturnValue.catch(() => {
    // Mark the rejection handled before passing it to React Flight.
  });
  return rejectedReturnValue;
}

async function loadNextServerAction(id: string) {
  try {
    return await ReactServer.loadServerAction(id);
  } catch (error) {
    console.warn(error);
    return;
  }
}

function toBaseConfig(): RenderConfiguration {
  return {
    reactStrictMode: config.reactStrictMode,
    rootOptions: config.rootOptions,
  };
}

async function createNextRouterInitialTree(
  node: ReactNode,
  defaultUrl: string,
  defaultRoute: string,
): Promise<ReactNode> {
  const location = new URL(defaultUrl, "http://localhost");
  const initialTree = await buildFlightRouterStateWithNext(
    defaultRoute,
    location.pathname,
    location.search,
  );

  return (
    <NextRouter
      url={defaultUrl}
      route={defaultRoute}
      initialTree={initialTree}
      initialSeedData={createSeedDataFromFlightRouterState(initialTree, node)}
    >
      {node}
    </NextRouter>
  );
}

export async function cleanup() {
  try {
    const rootEntries = Array.from(mountedRootEntries);
    for (const { container } of rootEntries) {
      await unmountRoot(container, true);
    }
  } finally {
    mountedRootEntries.length = 0;
    mountedContainers.clear();
    await baseCleanup();
    resetNavigationSpy();
    await resetNextRequestContextCache();
  }
}

type NavigationSpy = {
  mockClear: () => void;
};

function resetNavigationSpy() {
  (globalThis as typeof globalThis & { onNavigate?: NavigationSpy }).onNavigate?.mockClear();
}

// @ts-ignore
const expect = globalThis[Symbol.for("expect-global")];

export async function expectToHaveBeenNavigatedTo(url: Partial<URL>) {
  expect(globalThis.onNavigate).toHaveBeenCalledWith(expect.objectContaining(url));
}
