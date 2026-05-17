import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as ReactClient from "@vitejs/plugin-rsc/react/browser";
import type { RenderConfiguration } from "./testing-library.tsx";

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
const clientReferenceImportCache = new Map<string, Promise<unknown>>();
const preserveHeadAttribute = "data-vitest-plugin-rsc-preserve";
let preservedTesterHeadNodes: ChildNode[] | undefined;

type TestingLibraryClientGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
  __VITE_ENVIRONMENT_RUNNER_IMPORT__?: (environmentName: string, id: string) => Promise<unknown>;
  __vite_rsc_client_require__?: (id: string) => Promise<unknown>;
  __vite_rsc_require__?: (id: string) => Promise<unknown>;
  __vite_rsc_server_require__?: (id: string) => Promise<unknown>;
  __vitest_plugin_rsc_client_reference_root__?: string;
  __vitest_plugin_rsc_client_reference_root_prefixes__?: string[];
};

const clientGlobal = globalThis as TestingLibraryClientGlobals;

export async function createTestingLibraryClientRoot(options: {
  container: HTMLElement;
  config: RenderConfiguration;
  fetchRsc?: FetchRsc;
  serverActionCaller?: ServerActionCaller;
  hydrateDocument?: boolean;
  documentOnly?: boolean;
  initialPayload?: RscPayload;
  initialStream?: ReadableStream<Uint8Array>;
  documentHtml?: string;
}) {
  let setPayload: (v: RscPayload) => void;
  installClientReferenceRequire();

  if (options.documentOnly) {
    resetReactDocumentExpandos();
    applyDocumentHtml(options.documentHtml);
    return {
      rerender: async () => {},
      unmount: async () => {
        options.serverActionCaller?.cleanup();
        resetReactDocumentExpandos();
      },
    };
  }

  if (options.documentHtml && !options.hydrateDocument) {
    resetReactDocumentExpandos();
    applyDocumentHtml(options.documentHtml);
  }

  const initialPayload =
    options.initialPayload ??
    (await ReactClient.createFromReadableStream<RscPayload>(
      options.initialStream ?? (await getFetchRsc(options.fetchRsc)()),
    ));

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
      await getFetchRsc(options.fetchRsc)({ id, reply }),
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
      await getFetchRsc(options.fetchRsc)(),
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

function getFetchRsc(fetchRsc: FetchRsc | undefined): FetchRsc {
  if (fetchRsc) return fetchRsc;
  throw new Error("This testing root does not support RSC stream refetching.");
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

function applyDocumentHtml(html: string | undefined) {
  if (!html) {
    throw new Error("hydrateDocument requires a document HTML snapshot.");
  }

  const parsed = new DOMParser().parseFromString(`<!doctype html>${html}`, "text/html");
  const preservedHeadNodes = getPreservedTesterHeadNodes();

  syncAttributes(document.documentElement, parsed.documentElement);
  document.head.replaceChildren(
    ...preservedHeadNodes,
    ...cloneDocumentNodes(parsed.head.childNodes),
  );
  syncAttributes(document.body, parsed.body);
  document.body.replaceChildren(...cloneDocumentNodes(parsed.body.childNodes));
}

function getPreservedTesterHeadNodes(): ChildNode[] {
  if (!preservedTesterHeadNodes) {
    preservedTesterHeadNodes = Array.from(document.head.childNodes).filter(isTesterHeadNode);
  }
  return preservedTesterHeadNodes;
}

function isTesterHeadNode(node: ChildNode): boolean {
  if (!(node instanceof Element)) return false;
  if (node.hasAttribute(preserveHeadAttribute)) return true;

  const tagName = node.tagName.toLowerCase();
  if (tagName === "style") {
    return true;
  }
  if (tagName === "script") {
    return isVitestRuntimeUrl(node.getAttribute("src"));
  }
  if (tagName === "link" && node.getAttribute("rel") === "stylesheet") {
    return isVitestRuntimeUrl(node.getAttribute("href"));
  }
  if (tagName === "link" && node.getAttribute("rel") === "modulepreload") {
    return isVitestRuntimeUrl(node.getAttribute("href"));
  }

  return false;
}

function isVitestRuntimeUrl(value: string | null): boolean {
  return (
    value !== null &&
    (value.startsWith("/@fs/") ||
      value.startsWith("/@vite/") ||
      value.includes("/__vitest__/") ||
      value.includes("/__vitest_test__/") ||
      value.includes("/assets/"))
  );
}

function cloneDocumentNodes(nodes: NodeListOf<ChildNode>): ChildNode[] {
  // Scripts parsed through DOMParser are inert when imported, but they still
  // need to stay in the tree when the hydrated React tree contains them.
  return Array.from(nodes).map((node) => document.importNode(node, true));
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

// we call act only when rendering to flush any possible effects
// usually the async nature of Vitest browser mode ensures consistency,
// but rendering is sync and controlled by React directly
async function act<T>(callback: () => T | Promise<T>) {
  clientGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await React.act(callback);
  } finally {
    clientGlobal.IS_REACT_ACT_ENVIRONMENT = false;
  }
}

export function initialize() {
  installClientReferenceRequire();
}

export function configureClientReferenceRoot(root: string | undefined, prefixes: string[]) {
  const configuredRoot = root || process.env.__NEXT_PROJECT_ROOT;
  clientGlobal.__vitest_plugin_rsc_client_reference_root__ = configuredRoot
    ? configuredRoot.replace(/\/$/, "")
    : undefined;
  clientGlobal.__vitest_plugin_rsc_client_reference_root_prefixes__ = prefixes;
}

function installClientReferenceRequire() {
  ReactClient.setRequireModule({ load: loadClientReference });
  clientGlobal.__vite_rsc_client_require__ = loadClientReference;
  clientGlobal.__vite_rsc_require__ = (id) => {
    if (id.startsWith("$$server:")) {
      return getServerRequire()(id.slice("$$server:".length));
    }
    return loadClientReference(id);
  };
}

function getServerRequire() {
  const serverRequire = clientGlobal.__vite_rsc_server_require__;
  if (serverRequire) return serverRequire;
  throw new Error("React server reference loading was not initialized.");
}

function loadClientReference(id: string) {
  id = removeReferenceCacheTag(id);
  let mod = clientReferenceImportCache.get(id);
  if (!mod) {
    mod = importClientReference(id);
    clientReferenceImportCache.set(id, mod);
    pendingClientReferenceLoads.add(mod);
    const pendingMod = mod;
    pendingMod.then(
      () => pendingClientReferenceLoads.delete(pendingMod),
      () => pendingClientReferenceLoads.delete(pendingMod),
    );
  }
  return mod;
}

function removeReferenceCacheTag(id: string) {
  return id.split("$$cache=")[0]!;
}

function importClientReference(id: string) {
  id = resolveProjectRootRelativeClientReference(id);

  const runnerImport = clientGlobal.__VITE_ENVIRONMENT_RUNNER_IMPORT__;
  if (runnerImport) {
    return runnerImport("react_client", id);
  }

  return import(/* @vite-ignore */ toClientReferenceImportId(id));
}

function resolveProjectRootRelativeClientReference(id: string) {
  if (id.includes("://")) return id;

  const root = clientGlobal.__vitest_plugin_rsc_client_reference_root__;
  const prefixes = clientGlobal.__vitest_plugin_rsc_client_reference_root_prefixes__ ?? [];
  if (id.startsWith("/@id/")) return id;
  if (!root) return id;

  if (id.startsWith("/@fs/")) {
    const fsPath = id.slice("/@fs".length);
    return prefixes.some((prefix) => fsPath.startsWith(prefix)) ? `/@fs${root}${fsPath}` : id;
  }

  if (!prefixes.some((prefix) => id.startsWith(prefix))) return id;

  return `${root}${id}`;
}

function toClientReferenceImportId(id: string) {
  if (id.startsWith("/")) {
    return id.startsWith("/@fs/") || id.startsWith("/@id/") ? id : `/@fs${id}`;
  }
  if (!id.startsWith("\0") && !id.startsWith(".") && !id.includes("://")) {
    return `/@id/${id}`;
  }
  return id.startsWith("\0") ? `/@id/__x00__${id.slice(1)}` : id;
}
