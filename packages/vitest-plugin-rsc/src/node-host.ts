import { createNavigation } from "./navigation-shim.ts";
import { channelTo } from "./node-channel.ts";
import "./node-dom.ts";
import type { PageHost, WebApis } from "./page-host.ts";

// The host of a page in a worker of Node.js, with a DOM of happy-dom or
// jsdom: Vitest without Browser Mode, which has no WebSocket to the dev
// server: its channel is the plugin's own listener of HTTP on the loopback
// (node-channel.ts). The plugin makes the host with the listener's origin
// (index.ts).

// Not an import, which the page's runner would resolve as a module of the
// app's layer.
const fs = process.getBuiltinModule("node:fs");
// As the host loads, before a test fakes them: a test's fake timers replace
// the functions of `node:timers` too, not only the globals.
const { setImmediate: nodeSetImmediate, clearImmediate: nodeClearImmediate } =
  process.getBuiltinModule("node:timers");
const path = process.getBuiltinModule("node:path");

// What worker-web-apis.ts kept of Node's own, as Vitest loads it first in the
// worker (index.ts).
const webApisKey = Symbol.for("vitest-plugin-rsc:worker-web-apis");
const webApis: WebApis =
  (globalThis as unknown as Record<PropertyKey, WebApis | undefined>)[webApisKey] ??
  missingWebApis();

function missingWebApis(): never {
  throw new Error(
    "vitest-plugin-rsc: the worker of Node.js did not load the plugin's worker-web-apis.ts first, " +
      "which keeps the web APIs of Node.js for the server, before the DOM replaces them.",
  );
}

const isOf = (value: unknown, of: abstract new (...args: never[]) => unknown) =>
  value instanceof of;

// The page's fetch API is Node's too, as it is with jsdom, which has none of
// its own: happy-dom's is a browser's, which drops the headers that the
// plugin keeps for the server, `cookie` and `set-cookie`, and takes no
// `Headers` of Node's. What the page sends the plugin sends to the app or to
// Node's `fetch`, as a browser's `fetch` would. The DOM keeps its own
// `FormData`, which reads a form, and its `Blob`, `File` and
// `AbortController`: see `fromPage()`.
const scope = globalThis as unknown as Record<string, unknown>;
// The DOM's, to read a body of the DOM's with.
const DomResponse = scope.Response !== webApis.Response ? Response : undefined;
const { Request: NodeRequest, fetch: nodeFetch } = webApis;

// A `Request` of the page, as a browser's: a relative URL is of the page,
// and a body or a signal of the DOM's is one of Node's. Any request is one.
class PageRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      input instanceof NodeRequest ? input : new URL(String(input), location.href),
      fromPage(init),
    );
  }

  static override [Symbol.hasInstance](value: unknown): boolean {
    return Function.prototype[Symbol.hasInstance].call(
      this === PageRequest ? NodeRequest : this,
      value,
    );
  }
}

scope.Request = PageRequest;
scope.Response = webApis.Response;
scope.Headers = webApis.Headers;
scope.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  nodeFetch(new PageRequest(input, init));

// A body or a signal of the DOM's, as Node's: a signal that follows the
// page's, and a body that has the page's bytes.
function fromPage(init: RequestInit | undefined): RequestInit | undefined {
  const signal: AbortSignal | null | undefined = init?.signal;
  const body: unknown = init?.body;
  if (signal && !isOf(signal, webApis.AbortSignal)) {
    const controller = new webApis.AbortController();
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    init = { ...init, signal: controller.signal };
  }
  if (
    (body instanceof FormData && !isOf(body, webApis.FormData)) ||
    (body instanceof Blob && !isOf(body, webApis.Blob))
  ) {
    init = { ...init, ...bodyOf(body, new webApis.Headers(init!.headers)) };
  }
  return init;
}

// As the DOM's `Response` reads it, with the content type it gives it, or,
// for a DOM without one, the fields of a form, as Node's `FormData`.
function bodyOf(body: FormData | Blob, headers: Headers): RequestInit & { duplex: "half" } {
  if (DomResponse) {
    const read = new DomResponse(body);
    const type = read.headers.get("content-type");
    if (type && !headers.has("content-type")) headers.set("content-type", type);
    return { body: read.body, headers, duplex: "half" };
  }
  if (!(body instanceof FormData)) {
    throw new Error("vitest-plugin-rsc: a Blob of this DOM is not a body for the server yet.");
  }
  const form = new webApis.FormData();
  for (const [name, value] of body) {
    if (typeof value !== "string") {
      throw new Error(
        "vitest-plugin-rsc: a file of a form of this DOM is not a body for the server yet.",
      );
    }
    form.append(name, value);
  }
  return { body: form, headers, duplex: "half" };
}

// The DOM has no Navigation API: see navigation-shim.ts.
const navigation = createNavigation(window);

// The server's own files, of this worker: its test files run one after the
// other, and the workers of a run at once. A directory of its own in the
// run's, made as the first page asks for it. The run's goes as Vitest closes
// (../index.ts): a worker that Vitest stops gets no `exit` to clean up in.
let serverDir: string | undefined;
function serverDirOfWorker(serverFiles: string): string {
  return (serverDir ??= fs.mkdtempSync(path.join(serverFiles, "worker-")));
}

/**
 * The host of the page, whose dev server listens at `origin`, with the
 * server's files of the run in `serverFiles`.
 */
export function nodeHost(origin: string, serverFiles: string): PageHost {
  const { request, listen } = channelTo(origin);
  return {
    request,
    listen,
    navigation,
    loadsStylesheets: false,
    serverWebApis: webApis,
    fromPage,
    get serverDir() {
      return serverDirOfWorker(serverFiles);
    },
    // Node's own, not the global, which the DOM or a test's fake timers have.
    serverImmediate(callback) {
      const immediate = nodeSetImmediate(callback);
      return () => nodeClearImmediate(immediate);
    },
  };
}
