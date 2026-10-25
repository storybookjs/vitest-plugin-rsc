import { createNavigation } from "./navigation-shim.ts";
import "./node-dom.ts";
import { serverHttpOf } from "./node-http.ts";
import type { PageHost, WebApis } from "./page-host.ts";
import { runtimeRequestInit } from "./runtime-request-init.ts";
import { vitestModules } from "./vitest-modules.ts";
import { askOverWorkerChannel } from "./worker-channel.ts";

// The host of a page in a worker of Node.js, with a DOM of happy-dom or
// jsdom: Vitest without Browser Mode, which has no WebSocket to the dev
// server. The page gets its modules from Vitest's own RPC
// (vitest-modules.ts), and asks the rest on the worker's channel to Vitest's
// process (worker-channel.ts), which the plugin's pool answers.

// Not an import, which the page's runner would resolve as a module of the
// app's layer.
const fs = process.getBuiltinModule("node:fs");
// As the host loads, before a test fakes them: a test's fake timers replace
// the functions of `node:timers` too, not only the globals.
const { setImmediate: nodeSetImmediate, clearImmediate: nodeClearImmediate } =
  process.getBuiltinModule("node:timers");
const path = process.getBuiltinModule("node:path");

// What worker-web-apis.ts kept of Node's own, as the plugin's entry of the
// worker loads it before Vitest sets up the DOM (workers/forks.ts).
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

// What happy-dom's window has of its own: the settings of its browser, which
// its `Fetch` reads at every request, its interceptor among them.
type Intercepted = { request: Request };
type HappyDom = {
  settings: {
    fetch: {
      interceptor: {
        beforeAsyncRequest?: (context: Intercepted) => Promise<Response | void>;
      } | null;
    };
  };
};
const happyDom = (window as unknown as { happyDOM?: HappyDom }).happyDOM;

// With happy-dom, the page's fetch API is the DOM's own, as a browser's is
// the page's. The page's `fetch` is the context's, as in a browser
// (browser-context.ts); its `XMLHttpRequest` and the resources it loads go
// through happy-dom's `Fetch`, whose interceptor hands the app's requests to
// the server too (`interceptRequests()`), and sends the rest to the network
// itself.
//
// jsdom has none of its own: there the page's fetch API is Node's, which
// sends what the page sends to the app or to Node's `fetch`. The DOM keeps
// its own `FormData`, which reads a form, and its `Blob`, `File` and
// `AbortController`: a request of the page takes them as Node's. A body that
// the page's `Response` reads stays Node's: see "What a DOM of Node.js does
// otherwise than a browser" in docs/internals/architecture.md.
if (!happyDom) {
  const scope = globalThis as unknown as Record<string, unknown>;
  const { Request: NodeRequest, fetch: nodeFetch } = webApis;

  // A `Request` of the page, as a browser's: a relative URL is of the page,
  // and a body or a signal of the DOM's is one of Node's. Any request is one.
  class PageRequest extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        input instanceof NodeRequest ? input : new URL(String(input), location.href),
        runtimeRequestInit(init, webApis),
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

/** The host of the page in this worker, with the server's files of the run in `serverFiles`. */
export function nodeHost(serverFiles: string): PageHost {
  return {
    request: askOverWorkerChannel,
    modules: vitestModules(),
    navigation,
    loadsStylesheets: false,
    serverWebApis: webApis,
    interceptRequests: (answer) => {
      if (!happyDom) return false;
      const { fetch } = happyDom.settings;
      // Before an interceptor of the test's, which gets what the app does not answer.
      const before = fetch.interceptor;
      fetch.interceptor = {
        ...before,
        beforeAsyncRequest: async (context) => {
          let answered: Response | undefined;
          try {
            answered = await answer(context.request);
          } catch (error) {
            // happy-dom ends its task of the request only once the
            // interceptor resolves: for one that was aborted, it fails the
            // request itself.
            if (context.request.signal.aborted) return;
            throw error;
          }
          return answered ?? before?.beforeAsyncRequest?.(context);
        },
      };
      return true;
    },
    get serverDir() {
      return serverDirOfWorker(serverFiles);
    },
    // Node's own, not the global, which the DOM or a test's fake timers have.
    serverImmediate(callback) {
      const immediate = nodeSetImmediate(callback);
      return () => nodeClearImmediate(immediate);
    },
    // Node's own, over a connection in memory for each request.
    serverHttp: serverHttpOf(webApis),
  };
}
