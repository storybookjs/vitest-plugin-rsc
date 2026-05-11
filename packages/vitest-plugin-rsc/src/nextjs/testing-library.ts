import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { RenderConfiguration } from "../testing-library";
import { cleanup as baseCleanup, initialize as baseInitialize } from "../testing-library";
import { resetHeaders } from "./headers";

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

export async function cleanup() {
  resetHeaders();
  await baseCleanup();
}

// @ts-ignore
const expect = globalThis[Symbol.for("expect-global")];

export async function expectToHaveBeenNavigatedTo(url: Partial<URL>) {
  expect(globalThis.onNavigate).toHaveBeenCalledWith(expect.objectContaining(url));
}
