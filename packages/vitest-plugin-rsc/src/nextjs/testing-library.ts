import "next/dist/server/node-environment-baseline";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { CacheNodeSeedData, FlightDataPath } from "next/dist/shared/lib/app-router-types";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { RenderConfiguration } from "../testing-library";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  renderServer as baseRenderServer,
} from "../testing-library";
import { NextRouter } from "vitest-plugin-rsc/nextjs/client";
import { buildFlightRouterState } from "./flight-router-state";
import {
  createNextRequestContext,
  resetNextRequestContextCache,
  type NextRequestContextOptions,
} from "./request-context";

export * from "../testing-library";

export function initialize(customConfig: Partial<RenderConfiguration> = {}): void {
  baseInitialize({
    serverActionCaller: "vitest-plugin-rsc/nextjs/testing-library-client",
    rootOptions: {
      onCaughtError: (error) => {
        if (isNextRouterError(error)) return;
        console.log(error);
      },
      ...(customConfig.rootOptions ?? {}),
    },
    ...customConfig,
  });
}

export { NextRouter } from "vitest-plugin-rsc/nextjs/client";

type BaseRenderServerOptions = NonNullable<Parameters<typeof baseRenderServer>[1]>;

export async function renderServer(
  ui: ReactNode,
  { url = "/", headers, ...options }: BaseRenderServerOptions & NextRequestContextOptions = {},
) {
  const serverContext = await createNextRequestContext({ url, headers });
  const root = findNextRouterElement(ui) ? ui : createElement(NextRouter, { url }, ui);
  return baseRenderServer(root, {
    ...options,
    serverContext: {
      ...serverContext,
      createActionResponse: ({ root, returnValue, shouldRender }) =>
        createNextActionResponse(root, returnValue, shouldRender),
    },
  });
}

function createNextActionResponse(root: ReactNode, returnValue: unknown, shouldRender: boolean) {
  const nextRouter = findNextRouterElement(root);
  if (!shouldRender || !nextRouter) {
    return { a: returnValue, f: "", q: "", i: false };
  }

  const props = nextRouter.props as {
    children: ReactNode;
    route?: string;
    url?: string;
  };
  const url = props.url ?? "/";
  const route = props.route ?? url;
  const location = new URL(url, "http://localhost");
  const tree = buildFlightRouterState(route, location.pathname, location.search);
  const seedData: CacheNodeSeedData = [props.children, {}, null, false, null];

  return {
    a: returnValue,
    f: [[tree, seedData, null, false] satisfies FlightDataPath],
    q: location.search,
    i: false,
  };
}

function findNextRouterElement(node: ReactNode): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNextRouterElement(child);
      if (found) return found;
    }
    return;
  }

  if (!isValidElement(node)) return;
  if (
    node.type === NextRouter ||
    (node.type as { $$vitestPluginRscNextRouter?: true }).$$vitestPluginRscNextRouter ||
    (node.type as { $$id?: string }).$$id?.endsWith("#NextRouter")
  ) {
    return node;
  }

  return findNextRouterElement((node.props as { children?: ReactNode }).children);
}

export async function cleanup() {
  await baseCleanup();
  await resetNextRequestContextCache();
}

// @ts-ignore
const expect = globalThis[Symbol.for("expect-global")];

export async function expectToHaveBeenNavigatedTo(url: Partial<URL>) {
  expect(globalThis.onNavigate).toHaveBeenCalledWith(expect.objectContaining(url));
}
