import * as React from "react";
import * as ReactClient from "@vitejs/plugin-rsc/react/browser";
import type { InitialRSCPayload } from "next/dist/shared/lib/app-router-types";
import type { RenderConfiguration } from "../testing-library.tsx";
import {
  configureClientReferenceRoot,
  createTestingLibraryClientRoot,
  initialize as initializeTestingLibraryClient,
  type ServerActionCaller,
  type TestingLibraryClientRoot,
} from "../testing-library-client.tsx";
import { NextAppRouterHydrationBoundary } from "./client.tsx";
import { createNextDocumentFlightStream } from "./src/client/app-index.ts";

type NextAppRouterClientRootOptions = {
  container: HTMLElement;
  config: RenderConfiguration;
  serverActionCaller?: ServerActionCaller;
  hydrateDocument: boolean;
  documentHtml: string;
  projectRoot?: string;
  route?: string;
  url: string;
};

export function createServerActionCaller(): ServerActionCaller {
  return {
    call: callNextServerAction,
    cleanup: () => {},
  };
}

export async function createNextAppRouterClientRoot(
  options: NextAppRouterClientRootOptions,
): Promise<TestingLibraryClientRoot> {
  configureClientReferenceRoot(options.projectRoot, ["/app/", "/src/app/"]);
  initializeTestingLibraryClient();

  const initialRSCPayload = await ReactClient.createFromReadableStream<InitialRSCPayload>(
    createNextDocumentFlightStream(options.documentHtml),
  );

  return createTestingLibraryClientRoot({
    container: options.container,
    config: options.config,
    serverActionCaller: options.serverActionCaller,
    hydrateDocument: options.hydrateDocument,
    documentHtml: options.documentHtml,
    initialPayload: {
      root: React.createElement(NextAppRouterHydrationBoundary, {
        route: options.route,
        url: options.url,
        initialRSCPayload,
      }),
    },
  });
}

async function callNextServerAction(id: string, args: unknown[]) {
  const { callServer } = await import("next/dist/client/app-call-server.js");
  return callServer(id, args);
}
