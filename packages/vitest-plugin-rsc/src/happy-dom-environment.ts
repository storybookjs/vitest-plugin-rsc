import vm from "node:vm";
import type { Environment } from "vitest/runtime";

// The environment of a project whose page is in a worker of Node.js with
// happy-dom (page-in-node.ts), in place of Vitest's own: the page is a realm
// of its own. Vitest's environment puts the window's keys on the worker's
// global, its `fetch`, `Request`, `Response`, `Headers`, `FormData`, `Blob`,
// `File` and `AbortController` among them, so the server's layers, which run
// on that global, would have the DOM's web APIs. Here the window is a
// context of `node:vm`: the browser layer runs in it (see `compileInPage` of
// node-host.ts), with the window's web APIs, and the worker's global keeps
// Node's for the test and the server. The test and the plugin's own modules
// of the page get the document on the worker's global, as with Vitest's
// environment, but the web APIs that Node.js has too stay Node's.

// What the worker's global has of its own and gets of the window all the
// same: the document's, which a test and Testing Library use as globals.
const documentGlobals = new Set([
  "window",
  "self",
  "top",
  "parent",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "Event",
  "EventTarget",
  "CustomEvent",
  "MessageEvent",
  "ErrorEvent",
  "CloseEvent",
  "ProgressEvent",
  "Navigator",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "alert",
  "confirm",
  "prompt",
]);

// What a browser has and happy-dom's window has not: Node's, which the page
// has had from the worker's global so far.
const browserGlobalsOfNode = [
  "MessageChannel",
  "MessagePort",
  "BroadcastChannel",
  "structuredClone",
  "CompressionStream",
  "DecompressionStream",
  "TextEncoderStream",
  "TextDecoderStream",
];

type Scope = Record<string, unknown>;

// The names a window has, own or inherited, as a browser's global has them.
function namesOf(window: object): Set<string> {
  const names = new Set<string>();
  for (let target: object | null = window; target && target !== Object.prototype; ) {
    for (const name of Object.getOwnPropertyNames(target)) names.add(name);
    target = Object.getPrototypeOf(target) as object | null;
  }
  return names;
}

const isClassName = (name: string) => name[0] === name[0]!.toUpperCase();

export default {
  name: "happy-dom",
  viteEnvironment: "client",
  async setup(global, options) {
    const { GlobalWindow } = await import("happy-dom");
    const happyDOM = (options as { happyDOM?: Record<string, any> }).happyDOM ?? {};
    const window = new GlobalWindow({
      ...happyDOM,
      console: global.console,
      url: happyDOM.url ?? "http://localhost:3000",
      settings: { ...happyDOM.settings, disableErrorCapturing: true },
    }) as unknown as Scope;
    for (const name of browserGlobalsOfNode) {
      if (!(name in window) && name in global) window[name] = global[name];
    }
    // The test's clock: a test's fake `Date` is the worker's global's, which
    // the page sees too, as with Vitest's environment.
    Object.defineProperty(window, "Date", {
      configurable: true,
      get: () => global.Date,
      set: (value) => (global.Date = value),
    });
    // The ECMAScript globals are the context's own, as in a browser:
    // happy-dom's window has the worker's `Object`, `Array`, `JSON` and
    // others, where an object literal in the context has the context's
    // prototype. React's Flight client follows a reference of its payload
    // into an object only if its prototype is the `Object.prototype` of the
    // client's realm, and fails the page otherwise. The window keeps them as
    // its own, for code of the worker that reads them of it.
    const builtIns = (
      vm.runInNewContext("Object.getOwnPropertyNames(globalThis)") as string[]
    ).filter(
      (name) => name !== "Date" && Object.hasOwn(window, name) && window[name] === global[name],
    );
    for (const name of builtIns) delete window[name];
    const context = vm.runInContext("globalThis", vm.createContext(window)) as Scope;
    for (const name of builtIns) window[name] = context[name];

    const scope = global as Scope;
    const originals = new Map<string, PropertyDescriptor>();
    const set = new Map<string, unknown>();
    // `window`, `self`, `top` and `parent` are the window itself, not the
    // worker's global, which is the server's.
    const keys = [...new Set([...namesOf(window), ...documentGlobals])].filter(
      (name) =>
        name in window && name !== "Date" && (!(name in scope) || documentGlobals.has(name)),
    );
    for (const name of keys) {
      const own = Object.getOwnPropertyDescriptor(scope, name);
      if (own) originals.set(name, own);
      const value = window[name];
      const bound =
        typeof value === "function" && !isClassName(name)
          ? (value as (...args: unknown[]) => unknown).bind(window)
          : undefined;
      Object.defineProperty(scope, name, {
        configurable: true,
        get: () => (set.has(name) ? set.get(name) : (bound ?? window[name])),
        set(value) {
          set.set(name, value);
          window[name] = value;
        },
      });
    }
    return {
      async teardown() {
        const happy = (window as { happyDOM?: { abort(): Promise<void> } }).happyDOM;
        await happy?.abort();
        (window as { close(): void }).close();
        for (const name of keys) {
          const original = originals.get(name);
          if (original) Object.defineProperty(scope, name, original);
          else Reflect.deleteProperty(scope, name);
        }
      },
    };
  },
} satisfies Environment;
