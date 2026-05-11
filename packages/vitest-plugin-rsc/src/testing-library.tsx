import type { Container, RootOptions } from "react-dom/client";
import type { JSXElementConstructor, ReactNode } from "react";
import { importReactClient, importReactSsr } from "./utilts";
import type { FetchRsc, RscPayload, TestingLibraryClientRoot } from "./testing-library-client";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";

type ServerContext = {
  run<T>(phase: "render" | "action", callback: () => T | Promise<T>): T | Promise<T>;
  prepareRoot?: (options: {
    root: ReactNode;
    actionRequest?: Parameters<FetchRsc>[0];
  }) => ReactNode | Promise<ReactNode>;
  completeAction?: () =>
    | { shouldRender: boolean; headers?: HeadersInit }
    | Promise<{ shouldRender: boolean; headers?: HeadersInit }>;
  createActionResponse?: (options: {
    root: ReactNode;
    returnValue: unknown;
    shouldRender: boolean;
  }) => unknown | Promise<unknown>;
  createRouteResponse?: (options: {
    root: ReactNode;
    request: Extract<NonNullable<Parameters<FetchRsc>[0]>, { requestType: "next-route" }>;
  }) => unknown | Promise<unknown>;
};

const client = await importReactClient<typeof import("./testing-library-client")>(
  "vitest-plugin-rsc/testing-library-client",
);
const ssr = await importReactSsr<typeof import("./testing-library-ssr")>(
  "vitest-plugin-rsc/testing-library-ssr",
);

const mountedContainers = new Set<Container>();
const mountedRootEntries: {
  container: Container;
  root: TestingLibraryClientRoot;
}[] = [];

export async function renderServer(
  ui: ReactNode,
  {
    container,
    baseElement = document.body,
    wrapper: WrapperComponent,
    serverContext,
    hydrateDocument = false,
  }: {
    container?: HTMLElement;
    baseElement?: HTMLElement;
    wrapper?: JSXElementConstructor<{ children: ReactNode }>;
    serverContext?: ServerContext;
    hydrateDocument?: boolean;
  } = {},
): Promise<{
  container: HTMLElement;
  baseElement: HTMLElement;
  unmount: () => Promise<void>;
  rerender: (ui: ReactNode) => Promise<void>;
  asFragment: () => DocumentFragment;
}> {
  container ??= hydrateDocument
    ? document.body
    : baseElement.appendChild(document.createElement("div"));

  let root: TestingLibraryClientRoot;

  if (!mountedContainers.has(container)) {
    const fetchRsc: FetchRsc = async (actionRequest) => {
      let returnValue: unknown | undefined;
      let temporaryReferences: unknown | undefined;
      let actionResult: { shouldRender: boolean; headers?: HeadersInit } | undefined;
      if (actionRequest && "id" in actionRequest) {
        const { id, reply } = actionRequest;
        temporaryReferences = ReactServer.createTemporaryReferenceSet();
        const args = await ReactServer.decodeReply(reply as string | FormData, {
          temporaryReferences,
        });
        const action = await ReactServer.loadServerAction(id);
        returnValue = await runServer("action", () => action.apply(null, args));
        actionResult = await serverContext?.completeAction?.();
      }
      let serverRoot = ui;
      if (WrapperComponent) {
        serverRoot = <WrapperComponent>{ui}</WrapperComponent>;
      }
      serverRoot =
        (await serverContext?.prepareRoot?.({ root: serverRoot, actionRequest })) ?? serverRoot;

      if (actionRequest?.requestType === "next-action") {
        const actionResponse = (await serverContext?.createActionResponse?.({
          root: serverRoot,
          returnValue,
          shouldRender: actionResult?.shouldRender ?? true,
        })) ?? {
          a: returnValue,
          f: actionResult?.shouldRender === false ? "" : [],
          q: "",
          i: false,
        };
        const stream = await runServer("render", () =>
          ReactServer.renderToReadableStream(actionResponse, { temporaryReferences }),
        );
        const responseHeaders = new Headers(actionResult?.headers);
        responseHeaders.set("content-type", "text/x-component");
        return new Response(stream, {
          headers: responseHeaders,
        });
      }

      if (actionRequest?.requestType === "next-route") {
        const routeResponse = await serverContext?.createRouteResponse?.({
          root: serverRoot,
          request: actionRequest,
        });
        const stream = await runServer("render", () =>
          ReactServer.renderToReadableStream(routeResponse),
        );
        return new Response(stream, {
          headers: { "content-type": "text/x-component" },
        });
      }

      const rscPayload: RscPayload = {
        root: serverRoot,
        returnValue,
        shouldRender: actionResult?.shouldRender,
      };
      const rscOptions = { temporaryReferences };
      const stream = await runServer("render", () =>
        ReactServer.renderToReadableStream<RscPayload>(rscPayload, rscOptions),
      );
      return stream;
    };
    const initialStream = hydrateDocument ? await readStream(fetchRsc()) : undefined;
    const [ssrStream, clientStream] = initialStream?.tee() ?? [];
    const documentHtml = ssrStream ? await ssr.renderToHtml(ssrStream) : undefined;

    root = await client.createTestingLibraryClientRoot({
      container,
      config,
      fetchRsc,
      hydrateDocument,
      initialStream: clientStream,
      documentHtml,
    });
    mountedRootEntries.push({ container, root });
    mountedContainers.add(container);
  } else {
    root = mountedRootEntries.find((it) => it.container === container)!.root;
  }

  return {
    container,
    baseElement,
    unmount: root.unmount,
    rerender: async (newUi) => {
      ui = newUi;
      await root.rerender();
    },
    asFragment: () => {
      return document.createRange().createContextualFragment(container.innerHTML);
    },
  };

  function runServer<T>(phase: "render" | "action", callback: () => T | Promise<T>) {
    return serverContext ? serverContext.run(phase, callback) : callback();
  }
}

export async function cleanup() {
  for (const { root, container } of mountedRootEntries) {
    await root.unmount();
    if (container.parentNode === document.body) {
      document.body.removeChild(container);
    }
  }
  mountedRootEntries.length = 0;
  mountedContainers.clear();
}

export interface RenderConfiguration {
  reactStrictMode: boolean;
  rootOptions: RootOptions;
  serverActionCaller?: string | ((id: string, args: unknown[]) => Promise<unknown>);
}

const config: RenderConfiguration = {
  reactStrictMode: false,
  rootOptions: {},
  serverActionCaller: undefined,
};

declare let __vite_rsc_raw_import__: (id: string) => Promise<unknown>;

export function initialize(customConfig: Partial<RenderConfiguration> = {}): void {
  Object.assign(config, customConfig);

  ReactServer.setRequireModule({
    load: (id) => __vite_rsc_raw_import__(id),
  });
  ssr.initialize();
  client.initialize();
}

async function readStream(value: Promise<ReadableStream<Uint8Array> | Response>) {
  const response = await value;
  return response instanceof Response ? response.body! : response;
}
