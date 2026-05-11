import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as ReactDOMServer from "react-dom/server.browser";
import * as ReactClient from "@vitejs/plugin-rsc/react/browser";
import type { RenderConfiguration } from "./testing-library";

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: unknown;
  shouldRender?: boolean;
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
  hydrateDocument?: boolean;
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
    if (payload.shouldRender !== false) {
      setPayload(payload);
    }
    return payload.returnValue;
  });

  let browserRoot = <BrowserRoot />;

  if (options.config.reactStrictMode) {
    browserRoot = <React.StrictMode>{browserRoot}</React.StrictMode>;
  }

  const reactRoot = options.hydrateDocument
    ? await hydrateDocumentRoot(browserRoot, options.config.rootOptions)
    : await createRoot(options.container, browserRoot, options.config.rootOptions);

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

async function hydrateDocumentRoot(
  browserRoot: React.ReactNode,
  rootOptions: ReactDOMClient.RootOptions,
) {
  const ssrStream = await ReactDOMServer.renderToReadableStream(browserRoot);
  const html = await new Response(ssrStream).text();
  applyDocumentHtml(html);
  let reactRoot: ReactDOMClient.Root | undefined;
  await act(async () => {
    reactRoot = ReactDOMClient.hydrateRoot(document, browserRoot, rootOptions);
  });
  return reactRoot!;
}

async function createRoot(
  container: HTMLElement,
  browserRoot: React.ReactNode,
  rootOptions: ReactDOMClient.RootOptions,
) {
  let reactRoot: ReactDOMClient.Root | undefined;
  await act(async () => {
    reactRoot = ReactDOMClient.createRoot(container, rootOptions);
    reactRoot.render(browserRoot);
  });
  return reactRoot!;
}

function applyDocumentHtml(html: string) {
  const parsed = new DOMParser().parseFromString(`<!doctype html>${html}`, "text/html");

  syncAttributes(document.documentElement, parsed.documentElement);
  syncAttributes(document.body, parsed.body);
  document.body.replaceChildren(
    ...Array.from(parsed.body.childNodes).map((node) => document.importNode(node, true)),
  );
}

function syncAttributes(target: Element, source: Element) {
  for (const { name } of Array.from(target.attributes)) {
    target.removeAttribute(name);
  }
  for (const { name, value } of Array.from(source.attributes)) {
    target.setAttribute(name, value);
  }
}

const reactSameRealmRendererWarning =
  "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported.";

const didSuppressReactSameRealmRendererWarning = Symbol.for(
  "vitest-plugin-rsc:suppress-react-same-realm-renderer-warning",
);

function suppressReactSameRealmRendererWarning() {
  const globalState = globalThis as typeof globalThis &
    Record<typeof didSuppressReactSameRealmRendererWarning, boolean | undefined>;
  if (globalState[didSuppressReactSameRealmRendererWarning]) return;
  globalState[didSuppressReactSameRealmRendererWarning] = true;

  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (args[0] === reactSameRealmRendererWarning) return;
    originalError(...args);
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
  suppressReactSameRealmRendererWarning();
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
