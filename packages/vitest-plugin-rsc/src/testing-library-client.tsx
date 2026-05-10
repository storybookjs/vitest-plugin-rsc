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

const insertedDocumentHeadNodes = new WeakSet<ChildNode>();

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
    if (payload.shouldRender !== false) {
      setPayload(payload);
    }
    return payload.returnValue;
  });

  let browserRoot = <BrowserRoot />;

  if (options.config.reactStrictMode) {
    browserRoot = <React.StrictMode>{browserRoot}</React.StrictMode>;
  }

  const reactRoot = await hydrateRoot(browserRoot, options.container, options.config.rootOptions);

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

async function hydrateRoot(
  browserRoot: React.ReactNode,
  container: HTMLElement,
  rootOptions: ReactDOMClient.RootOptions,
) {
  const ssrStream = await ReactDOMServer.renderToReadableStream(browserRoot);
  const html = await new Response(ssrStream).text();
  if (isDocumentHtml(html)) {
    const { preservedHeadNodes, scripts } = applyDocumentHtml(html);
    activateScripts(scripts);
    let root: ReactDOMClient.Root | undefined;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(document, browserRoot, rootOptions);
    });
    document.head.append(...preservedHeadNodes);
    return root!;
  }

  container.innerHTML = html;
  activateScripts([container]);
  let root: ReactDOMClient.Root | undefined;
  await act(() => {
    root = ReactDOMClient.hydrateRoot(container, browserRoot, rootOptions);
  });
  return root!;
}

function isDocumentHtml(html: string) {
  return /^(?:\s*<!doctype[^>]*>\s*)?<html(?:\s|>)/i.test(html);
}

function applyDocumentHtml(html: string) {
  const parsed = new DOMParser().parseFromString(`<!doctype html>${html}`, "text/html");
  const existingHeadNodes = Array.from(document.head.childNodes);
  const nextHeadNodes = Array.from(parsed.head.childNodes).map((node) =>
    document.importNode(node, true),
  );
  const nextBodyNodes = Array.from(parsed.body.childNodes).map((node) =>
    document.importNode(node, true),
  );
  const preservedHeadNodes = existingHeadNodes.filter(
    (node) =>
      !insertedDocumentHeadNodes.has(node) &&
      !nextHeadNodes.some((nextNode) => isSameHeadNode(node, nextNode)),
  );

  syncAttributes(document.documentElement, parsed.documentElement);
  syncAttributes(document.head, parsed.head);
  syncAttributes(document.body, parsed.body);
  for (const node of nextHeadNodes) {
    insertedDocumentHeadNodes.add(node);
  }
  document.head.replaceChildren(...nextHeadNodes);
  document.body.replaceChildren(...nextBodyNodes);
  return { preservedHeadNodes, scripts: [...nextHeadNodes, ...nextBodyNodes] };
}

function activateScripts(nodes: ChildNode[]) {
  for (const node of nodes) {
    const scripts =
      node instanceof HTMLScriptElement
        ? [node]
        : node instanceof Element
          ? Array.from(node.querySelectorAll("script"))
          : [];

    for (const script of scripts) {
      const executable = document.createElement("script");
      for (const { name, value } of Array.from(script.attributes)) {
        executable.setAttribute(name, value);
      }
      executable.textContent = script.textContent;
      script.replaceWith(executable);
    }
  }
}

function syncAttributes(target: Element, source: Element) {
  for (const { name } of Array.from(target.attributes)) {
    target.removeAttribute(name);
  }
  for (const { name, value } of Array.from(source.attributes)) {
    target.setAttribute(name, value);
  }
}

function isSameHeadNode(a: ChildNode, b: ChildNode) {
  if (!(a instanceof Element) || !(b instanceof Element)) return false;
  const aKey = getHeadNodeKey(a);
  return aKey !== "" && aKey === getHeadNodeKey(b);
}

function getHeadNodeKey(node: Element) {
  const tagName = node.tagName.toLowerCase();
  if (tagName === "title") return "title";
  if (tagName === "meta") {
    const key =
      node.getAttribute("charset") ??
      node.getAttribute("name") ??
      node.getAttribute("property") ??
      node.getAttribute("http-equiv");
    return key ? `${tagName}:${key}` : "";
  }
  if (tagName === "link") {
    const rel = node.getAttribute("rel");
    const href = node.getAttribute("href");
    return rel && href ? `${tagName}:${rel}:${href}` : "";
  }
  if (tagName === "script") {
    const src = node.getAttribute("src");
    return src ? `${tagName}:${src}` : "";
  }
  return "";
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
