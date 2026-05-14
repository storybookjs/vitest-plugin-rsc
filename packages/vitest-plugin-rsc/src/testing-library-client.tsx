import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as ReactClient from "@vitejs/plugin-rsc/react/browser";
import type { RenderConfiguration } from "./testing-library";

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: unknown;
};

export type TestingLibraryClientRoot = Awaited<ReturnType<typeof createTestingLibraryClientRoot>>;

export type FetchRsc = (actionRequest?: {
  id: string;
  reply: string | FormData;
}) => Promise<ReadableStream<Uint8Array>>;

export type ServerActionCaller = {
  call: (id: string, args: unknown[]) => Promise<unknown>;
  cleanup: () => void;
};

const pendingClientReferenceLoads = new Set<Promise<unknown>>();

export async function createTestingLibraryClientRoot(options: {
  container: HTMLElement;
  config: RenderConfiguration;
  fetchRsc: FetchRsc;
  serverActionCaller?: ServerActionCaller;
  hydrateDocument?: boolean;
  initialStream?: ReadableStream<Uint8Array>;
  documentHtml?: string;
}) {
  let setPayload: (v: RscPayload) => void;

  const initialPayload = await ReactClient.createFromReadableStream<RscPayload>(
    options.initialStream ?? (await options.fetchRsc()),
  );

  function BrowserRoot() {
    const [payload, setPayload_] = React.useState(initialPayload);

    React.useEffect(() => {
      setPayload = (v) => React.startTransition(() => setPayload_(v));
    }, [setPayload_]);

    return payload.root;
  }

  ReactClient.setServerCallback(async (id, args) => {
    if (options.serverActionCaller) {
      return options.serverActionCaller.call(id, args);
    }
    const temporaryReferences = ReactClient.createTemporaryReferenceSet();
    const reply = await ReactClient.encodeReply(args, { temporaryReferences });
    const payload = await ReactClient.createFromReadableStream<RscPayload>(
      await options.fetchRsc({ id, reply }),
      { temporaryReferences },
    );
    setPayload(payload);
    return payload.returnValue;
  });

  let browserRoot = <BrowserRoot />;

  if (options.config.reactStrictMode) {
    browserRoot = <React.StrictMode>{browserRoot}</React.StrictMode>;
  }

  const reactRoot = options.hydrateDocument
    ? await hydrateDocumentRoot(browserRoot, options.documentHtml, options.config.rootOptions)
    : await createRoot(options.container, browserRoot, options.config.rootOptions);

  async function rerender() {
    const payload = await ReactClient.createFromReadableStream<RscPayload>(
      await options.fetchRsc(),
    );
    setPayload(payload);
  }

  function unmount() {
    options.serverActionCaller?.cleanup();
    reactRoot.unmount();
    if (options.hydrateDocument) {
      resetReactDocumentExpandos();
    }
  }

  return {
    rerender: () => act(() => rerender()),
    unmount: () => act(() => unmount()),
  };
}

async function hydrateDocumentRoot(
  browserRoot: React.ReactNode,
  documentHtml: string | undefined,
  rootOptions: ReactDOMClient.RootOptions,
) {
  if (!documentHtml) {
    throw new Error("hydrateDocument requires a document HTML snapshot.");
  }

  resetReactDocumentExpandos();
  applyDocumentHtml(documentHtml);

  let reactRoot: ReactDOMClient.Root | undefined;
  await act(async () => {
    reactRoot = ReactDOMClient.hydrateRoot(document, browserRoot, rootOptions);
    await waitForClientReferenceLoads();
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
    await waitForClientReferenceLoads();
  });
  return reactRoot!;
}

function applyDocumentHtml(html: string) {
  const parsed = new DOMParser().parseFromString(`<!doctype html>${html}`, "text/html");

  syncAttributes(document.documentElement, parsed.documentElement);
  document.head.replaceChildren(
    ...Array.from(parsed.head.childNodes).map((node) => document.importNode(node, true)),
  );
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

function resetReactDocumentExpandos() {
  for (const key of Object.keys(document)) {
    if (/^_+react/.test(key)) {
      // Whole-document tests reuse the Document object across roots. React
      // leaves root-scoped expando markers there, so clear them with the root.
      delete (document as unknown as Record<string, unknown>)[key];
    }
  }
}

async function waitForClientReferenceLoads() {
  // RSC deserialization starts client-reference imports before React hydrates.
  // Keeping those imports inside the act scope lets their hydration pings flush deterministically.
  while (pendingClientReferenceLoads.size > 0) {
    await Promise.allSettled(pendingClientReferenceLoads);
  }
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
    load: (id) => {
      const mod = import(/* @vite-ignore */ id);
      pendingClientReferenceLoads.add(mod);
      mod.then(
        () => pendingClientReferenceLoads.delete(mod),
        () => pendingClientReferenceLoads.delete(mod),
      );
      return mod;
    },
  });
}
