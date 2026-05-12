import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as ReactClient from "@vitejs/plugin-rsc/react/browser";
import type { RenderConfiguration } from "./testing-library";

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: unknown;
};

export type TestingLibraryClientRoot = Awaited<ReturnType<typeof createTestingLibraryClientRoot>>;

export type FetchRsc = (
  request?:
    | {
        id: string;
        reply: unknown;
        requestType?: "rsc" | "next-action";
      }
    | {
        requestType: "next-route";
        url: string;
        routerState?: string | null;
      },
) => Promise<ReadableStream<Uint8Array> | Response>;

type ServerActionCaller = {
  call: (id: string, args: unknown[]) => Promise<unknown>;
  cleanup: () => void;
};

type ServerActionCallerModule = {
  createServerActionCaller: (options: {
    fetchRsc: FetchRsc;
  }) => ServerActionCaller | Promise<ServerActionCaller>;
};

export async function createTestingLibraryClientRoot(options: {
  container: HTMLElement;
  config: RenderConfiguration;
  fetchRsc: FetchRsc;
}) {
  let setPayload: (v: RscPayload) => void;
  const serverActionCaller = await createServerActionCaller(options);

  const initialPayload = await ReactClient.createFromReadableStream<RscPayload>(
    await readStream(options.fetchRsc()),
  );

  function BrowserRoot() {
    const [payload, setPayload_] = React.useState(initialPayload);

    React.useEffect(() => {
      setPayload = (v) => React.startTransition(() => setPayload_(v));
    }, [setPayload_]);

    return payload.root;
  }

  ReactClient.setServerCallback(async (id, args) => {
    if (options.config.serverActionCaller) {
      return serverActionCaller!.call(id, args);
    }
    const temporaryReferences = ReactClient.createTemporaryReferenceSet();
    const reply = await ReactClient.encodeReply(args, { temporaryReferences });
    const payload = await ReactClient.createFromReadableStream<RscPayload>(
      await readStream(options.fetchRsc({ id, reply })),
      { temporaryReferences },
    );
    setPayload(payload);
    return payload.returnValue;
  });

  let browserRoot = <BrowserRoot />;

  if (options.config.reactStrictMode) {
    browserRoot = <React.StrictMode>{browserRoot}</React.StrictMode>;
  }

  const reactRoot = ReactDOMClient.createRoot(options.container, options.config.rootOptions);
  reactRoot.render(browserRoot);

  async function rerender() {
    const payload = await ReactClient.createFromReadableStream<RscPayload>(
      await readStream(options.fetchRsc()),
    );
    setPayload(payload);
  }

  function unmount() {
    serverActionCaller?.cleanup();
    reactRoot.unmount();
  }

  return {
    rerender: () => act(() => rerender()),
    unmount: () => act(() => unmount()),
  };
}

async function readStream(value: Promise<ReadableStream<Uint8Array> | Response>) {
  const response = await value;
  return response instanceof Response ? response.body! : response;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// we call act only when rendering to flush any possible effects
// usually the async nature of Vitest browser mode ensures consistency,
// but rendering is sync and controlled by React directly
async function act<T>(callback: () => T | Promise<T>) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await React.act(callback);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  }
}

export function initialize() {
  ReactClient.setRequireModule({
    load: (id) => import(/* @vite-ignore */ id),
  });
}

async function createServerActionCaller(options: {
  config: RenderConfiguration;
  fetchRsc: FetchRsc;
}): Promise<ServerActionCaller | undefined> {
  const caller = options.config.serverActionCaller;
  if (!caller) return;

  if (typeof caller === "function") {
    return {
      call: caller,
      cleanup: () => {},
    };
  }

  const mod = (await import(
    /* @vite-ignore */ toBrowserModuleId(caller)
  )) as ServerActionCallerModule;
  return mod.createServerActionCaller({
    fetchRsc: options.fetchRsc,
  });
}

function toBrowserModuleId(id: string) {
  if (id.startsWith("file://")) {
    return `/@fs${new URL(id).pathname}`;
  }
  if (id.startsWith("/")) {
    return `/@fs${id}`;
  }
  return `/@id/${id}`;
}
