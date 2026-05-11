import "next/dist/server/node-environment-baseline";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { FlightRouterState } from "next/dist/shared/lib/app-router-types";
import {
  cloneElement,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type { RenderConfiguration } from "../testing-library";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  renderServer as baseRenderServer,
} from "../testing-library";
import { NextRouter } from "vitest-plugin-rsc/nextjs/client";
import { createNextActionResponse, createNextRouteResponse } from "./flight-payload";
import { buildFlightRouterStateWithNext } from "./flight-router-state";
import {
  createNextRequestContext,
  resetNextRequestContextCache,
  type NextRequestContextOptions,
} from "./request-context";
import { findNextRouterElement, isNextRouterElement } from "./router-element";

export * from "../testing-library";

export type NextRenderConfiguration = Partial<RenderConfiguration> & {
  nextRscRequestsViaMsw?: boolean;
};

let config: NextRenderConfiguration = {
  nextRscRequestsViaMsw: false,
};
let initialHead: DocumentHeadSnapshot | undefined;

type DocumentHeadSnapshot = {
  attributes: { name: string; value: string }[];
  childNodes: Node[];
};

export function initialize(customConfig: NextRenderConfiguration = {}): void {
  config = {
    ...config,
    ...customConfig,
  };
  initialHead ??= snapshotDocumentHead();
  baseInitialize({
    serverActionCaller: config.nextRscRequestsViaMsw
      ? "vitest-plugin-rsc/nextjs/testing-library-client"
      : undefined,
    rootOptions: {
      onCaughtError: (error) => {
        if (isNextRouterError(error)) return;
        console.log(error);
      },
      ...(customConfig.rootOptions ?? {}),
    },
    ...config,
  });
}

export { NextRouter } from "vitest-plugin-rsc/nextjs/client";

type BaseRenderServerOptions = NonNullable<Parameters<typeof baseRenderServer>[1]>;

export async function renderServer(
  ui: ReactNode,
  { url = "/", headers, ...options }: BaseRenderServerOptions & NextRequestContextOptions = {},
) {
  const serverContext = await createNextRequestContext({ url, headers });
  return baseRenderServer(ui, {
    ...options,
    serverContext: {
      run: serverContext.run,
      prepareRoot: ({ root }) => withNextRouterInitialTree(root, url),
      completeAction: config.nextRscRequestsViaMsw
        ? serverContext.completeAction
        : () => ({ shouldRender: true }),
      createActionResponse: config.nextRscRequestsViaMsw
        ? ({ root, returnValue, shouldRender }) =>
            createNextActionResponse(root, returnValue, shouldRender)
        : undefined,
      createRouteResponse: ({ root, request }) =>
        createNextRouteResponse(root, request.url, request.routerState),
    },
  });
}

async function withNextRouterInitialTree(node: ReactNode, defaultUrl: string): Promise<ReactNode> {
  if (!findNextRouterElement(node)) {
    const location = new URL(defaultUrl, "http://localhost");
    const Router = NextRouter as (props: {
      children?: ReactNode;
      document?: boolean;
      route?: string;
      url?: string;
      initialTree?: FlightRouterState;
    }) => ReactElement | null;

    return createElement(
      Router,
      {
        url: defaultUrl,
        route: location.pathname,
        initialTree: await buildFlightRouterStateWithNext(
          location.pathname,
          location.pathname,
          location.search,
        ),
      },
      node,
    );
  }

  return injectNextRouterInitialTree(node);
}

async function injectNextRouterInitialTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child) => injectNextRouterInitialTree(child)));
  }

  if (!isValidElement(node)) return node;

  if (isNextRouterElement(node)) {
    const props = node.props as {
      children?: ReactNode;
      route?: string;
      url?: string;
    };
    const url = props.url ?? "/";
    const route = props.route ?? url;
    const location = new URL(url, "http://localhost");
    return cloneElement(node as ReactElement<{ initialTree?: unknown }>, {
      initialTree: await buildFlightRouterStateWithNext(route, location.pathname, location.search),
    });
  }

  const props = node.props as { children?: ReactNode };
  if (!props.children) return node;

  return cloneElement(node as ReactElement<{ children?: ReactNode }>, {
    children: await injectNextRouterInitialTree(props.children),
  });
}

export async function cleanup() {
  await baseCleanup();
  restoreInitialDocumentHead();
  resetDocumentBody();
  await resetNextRequestContextCache();
}

function resetDocumentBody() {
  for (const { name } of Array.from(document.body.attributes)) {
    document.body.removeAttribute(name);
  }
  document.body.replaceChildren();
}

function snapshotDocumentHead(): DocumentHeadSnapshot {
  return {
    attributes: Array.from(document.head.attributes).map(({ name, value }) => ({ name, value })),
    childNodes: Array.from(document.head.childNodes).map((node) => node.cloneNode(true)),
  };
}

function restoreInitialDocumentHead() {
  if (!initialHead) return;

  for (const { name } of Array.from(document.head.attributes)) {
    document.head.removeAttribute(name);
  }
  for (const { name, value } of initialHead.attributes) {
    document.head.setAttribute(name, value);
  }
  document.head.replaceChildren(...initialHead.childNodes.map((node) => node.cloneNode(true)));
}

// @ts-ignore
const expect = globalThis[Symbol.for("expect-global")];

export async function expectToHaveBeenNavigatedTo(url: Partial<URL>) {
  expect(globalThis.onNavigate).toHaveBeenCalledWith(expect.objectContaining(url));
}
