import { createNavigation } from "./navigation-shim.ts";
import "./node-dom.ts";
import type { PageHost } from "./page-host.ts";
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
const vm = process.getBuiltinModule("node:vm");

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

// With happy-dom, the window is a realm of its own (happy-dom-environment.ts),
// whose fetch API is the DOM's own, as a browser's is the page's: the
// browser layer runs in it. The page's `fetch` is the context's, as in a
// browser (browser-context.ts); its `XMLHttpRequest` and the resources it
// loads go through happy-dom's `Fetch`, whose interceptor hands the app's
// requests to the server too (`interceptRequests()`), and sends the rest to
// the network itself. The server keeps the worker's global, with Node's web
// APIs.
//
// jsdom has no fetch API of its own, and its window is the worker's global,
// as Vitest's environment makes it: there the page's fetch API is Node's,
// which sends what the page sends to the app or to Node's `fetch`. See "What
// a DOM of Node.js does otherwise than a browser" in
// docs/internals/architecture.md.
function jsdomFetchApi() {
  const scope = globalThis as unknown as Record<string, unknown>;
  const { Request: NodeRequest, fetch: nodeFetch } = globalThis;

  // A `Request` of the page, as a browser's: a relative URL is of the page.
  // Any request is one.
  class PageRequest extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input instanceof NodeRequest ? input : new URL(String(input), location.href), init);
    }

    static override [Symbol.hasInstance](value: unknown): boolean {
      return Function.prototype[Symbol.hasInstance].call(
        this === PageRequest ? NodeRequest : this,
        value,
      );
    }
  }

  scope.Request = PageRequest;
  scope.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    nodeFetch(new PageRequest(input, init));
}

// The globals of the plugin and of Vitest, like the registry of the server
// (nextjs/registry.ts), which the page's code reads and writes as a browser's
// page does, where they are its own: the worker's, one for both realms, as
// accessors of the window for each that the worker has by the time the page
// compiles a module. Not a proxy in the window's prototypes, which would
// hide the context's own builtins, like `WeakRef`, from its code.
function shareGlobalsOfVitest(realm: object): void {
  const scope = globalThis as unknown as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(scope)) {
    if (!name.startsWith("__vitest_") || Object.hasOwn(realm, name)) continue;
    Object.defineProperty(realm, name, {
      configurable: true,
      get: () => scope[name],
      set: (value) => (scope[name] = value),
    });
  }
}

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

// The server's own files, of this worker: its test files run one after the
// other, and the workers of a run at once. A directory of its own in the
// run's, made as the first page asks for it. The run's goes as Vitest closes
// (../index.ts): a worker that Vitest stops gets no `exit` to clean up in.
let serverDir: string | undefined;
function serverDirOfWorker(serverFiles: string): string {
  return (serverDir ??= fs.mkdtempSync(path.join(serverFiles, "worker-")));
}

/**
 * The host of the page in this worker, with the server's files of the run in
 * `serverFiles`, and the page in `window`.
 */
export function nodeHost(
  serverFiles: string,
  window: Window & typeof globalThis = globalThis.window,
): PageHost {
  const happyDom = (window as unknown as { happyDOM?: HappyDom }).happyDOM;
  if (!happyDom) jsdomFetchApi();
  const realm = vm.isContext(window) ? window : undefined;
  // A page has a `process` with the env of the run, as in a browser, where
  // the server's platform gives it one (nextjs/globals.ts): the server's own
  // `env`, not the rest of Node's `process`.
  if (realm) (realm as { process?: unknown }).process ??= { env: process.env };
  return {
    request: askOverWorkerChannel,
    modules: vitestModules(),
    // The DOM has no Navigation API: see navigation-shim.ts.
    navigation: createNavigation(window),
    loadsStylesheets: false,
    // Laid out as `new AsyncFunction()` lays it out: see page-host.ts.
    compileInPage(params, body) {
      if (!realm) return new AsyncFunction(...params, body);
      shareGlobalsOfVitest(realm);
      return vm.runInContext(
        `(async function anonymous(${params.join(",")}\n) {\n${body}\n})`,
        realm,
      );
    },
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
  };
}
