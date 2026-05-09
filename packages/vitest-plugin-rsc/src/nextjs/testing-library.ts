import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { ReactNode } from "react";
import type { RenderConfiguration } from "../testing-library";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  renderServer as baseRenderServer,
} from "../testing-library";
import { createNextRequestContext, type NextRequestContextOptions } from "./request-context";

export * from "../testing-library";

export function initialize(customConfig: Partial<RenderConfiguration> = {}): void {
  baseInitialize({
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
  return baseRenderServer(ui, {
    ...options,
    serverContext,
  });
}

export async function cleanup() {
  await baseCleanup();
}

// @ts-ignore
const expect = globalThis[Symbol.for("expect-global")];

export async function expectToHaveBeenNavigatedTo(url: Partial<URL>) {
  expect(globalThis.onNavigate).toHaveBeenCalledWith(expect.objectContaining(url));
}
