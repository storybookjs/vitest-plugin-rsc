import type { Container, RootOptions } from "react-dom/client";
import type { JSXElementConstructor, ReactNode } from "react";
import { resetAsyncLocalStorage } from "./async-local-storage";
import { importReactClient } from "./utilts";
import type { FetchRsc, RscPayload, TestingLibraryClientRoot } from "./testing-library-client";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";

const client = await importReactClient<typeof import("./testing-library-client")>(
  "vitest-plugin-rsc/testing-library-client",
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
  }: {
    container?: HTMLElement;
    baseElement?: HTMLElement;
    wrapper?: JSXElementConstructor<{ children: ReactNode }>;
  } = {},
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
        returnValue = await action.apply(null, args);
      }
      let serverRoot = ui;
      if (WrapperComponent) {
        serverRoot = <WrapperComponent>{ui}</WrapperComponent>;
      }
      const rscPayload: RscPayload = {
        root: serverRoot,
        returnValue,
      };
      const rscOptions = { temporaryReferences };
      const stream = ReactServer.renderToReadableStream<RscPayload>(rscPayload, rscOptions);
      return stream;
    };
    root = await client.createTestingLibraryClientRoot({
      container,
      config,
      fetchRsc,
    });
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

export async function cleanup() {
  try {
    for (const { container } of [...mountedRootEntries]) {
      await unmountRoot(container, true);
    }
  } finally {
    mountedRootEntries.length = 0;
    mountedContainers.clear();
    // The browser async context shim is process-global inside the worker.
    // Always reset it during cleanup so failed/unmounted renders cannot leak
    // request state into the next sequential test.
    resetAsyncLocalStorage();
  }
}

export interface RenderConfiguration {
  reactStrictMode: boolean;
  rootOptions: RootOptions;
}

const config: RenderConfiguration = {
  reactStrictMode: false,
  rootOptions: {},
};

declare let __vite_rsc_raw_import__: (id: string) => Promise<unknown>;

export function initialize(customConfig: Partial<RenderConfiguration> = {}): void {
  Object.assign(config, customConfig);

  ReactServer.setRequireModule({
    load: (id) => __vite_rsc_raw_import__(id),
  });
  client.initialize();
}
