import { expect, test, vi } from "vitest";
import {
  createNextRoutingData,
  type NextRoutingManifest,
} from "./src/build/adapter/build-complete.ts";
import type { NextRouteHandlerManifestEntry, NextRouteManifest } from "./request-router.ts";

const virtualNextRoutes = vi.hoisted(() => ({
  current: undefined as NextRouteManifest | undefined,
}));

const reactClientModules = vi.hoisted(() => ({
  testingLibraryClient: {
    createTestingLibraryClientRoot: vi.fn(),
  },
  nextTestingLibraryClient: {
    createServerActionCaller: vi.fn(() => ({
      call: vi.fn(),
      cleanup: vi.fn(),
    })),
  },
  nextClient: {
    NextAppRouterHydrationBoundary: vi.fn(),
  },
}));

vi.mock("../utilts.ts", () => ({
  importReactClient: vi.fn(async (id: string) => {
    if (id === "vitest-plugin-rsc/testing-library-client") {
      return reactClientModules.testingLibraryClient;
    }
    if (id === "vitest-plugin-rsc/nextjs/testing-library-client") {
      return reactClientModules.nextTestingLibraryClient;
    }
    if (id === "vitest-plugin-rsc/nextjs/client") {
      return reactClientModules.nextClient;
    }
    throw new Error(`Unexpected react client import in test: ${id}`);
  }),
  importReactSsr: vi.fn(async (id: string) => {
    if (id === "vitest-plugin-rsc/testing-library-ssr") {
      return { renderToHtml: vi.fn() };
    }
    throw new Error(`Unexpected react SSR import in test: ${id}`);
  }),
}));

vi.mock("@vitejs/plugin-rsc/react/rsc", () => ({
  createFromReadableStream: vi.fn(),
  createTemporaryReferenceSet: vi.fn(),
  decodeReply: vi.fn(),
  loadServerAction: vi.fn(),
  renderToReadableStream: vi.fn(),
}));

vi.mock("virtual:vitest-plugin-rsc/next-routes", () => ({
  get nextRouteManifest() {
    return virtualNextRoutes.current?.pages ?? [];
  },
  get nextRouteHandlerManifest() {
    return virtualNextRoutes.current?.routeHandlers ?? [];
  },
  get routing() {
    const routingData = virtualNextRoutes.current?.routingData;
    if (!routingData) {
      throw new Error("Expected test to configure the virtual Next route manifest.");
    }
    return routingData;
  },
}));

test("renderServer({ url }) rejects route-handler targets before client rendering", async () => {
  virtualNextRoutes.current = createManifest({
    routeHandlers: [routeHandler("/api/notes")],
  });
  const { renderServer } = await import("./testing-library-runtime.tsx");

  await expect(
    renderServer({
      url: "/api/notes?from=unit",
      container: {} as HTMLElement,
      baseElement: {} as HTMLElement,
    }),
  ).rejects.toThrow(
    'renderServer({ url: "/api/notes" }) matched Next route handler "/api/notes/route" at /app/api/notes/route.ts. Route handlers are not page render targets yet',
  );
  expect(
    reactClientModules.testingLibraryClient.createTestingLibraryClientRoot,
  ).not.toHaveBeenCalled();
});

function createManifest({
  routeHandlers = [],
  redirects = [],
}: {
  routeHandlers?: NextRouteHandlerManifestEntry[];
  redirects?: NextRoutingManifest["customRoutes"]["redirects"];
}): NextRouteManifest {
  return {
    pages: [],
    routeHandlers,
    routingData: createNextRoutingData({
      pages: [],
      routeHandlers,
      customRoutes: {
        headers: [],
        onMatchHeaders: [],
        redirects,
        rewrites: {
          beforeFiles: [],
          afterFiles: [],
          fallback: [],
        },
      },
    }),
  };
}

function routeHandler(
  route: string,
  overrides: Partial<NextRouteHandlerManifestEntry> = {},
): NextRouteHandlerManifestEntry {
  return {
    route,
    appPath: `${route}/route`,
    routeFile: `/app${route}/route.ts`,
    ...overrides,
  };
}
