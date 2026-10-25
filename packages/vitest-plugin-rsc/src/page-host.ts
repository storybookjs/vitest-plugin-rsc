// What the page needs of the host it runs in, which the plugin chooses for a
// run (index.ts): a browser, as in Vitest's Browser Mode, Storybook or a
// static build (browser-host.ts), or a worker of Node.js with a DOM of
// happy-dom or jsdom, without Browser Mode (node-host.ts). The page's modules
// import it as `virtual:vitest-plugin-rsc/page-host`, and nothing else of the
// page tells the two apart.

import type { InvokePayload, InvokeResult } from "./built-layers.ts";

export type PageHost = {
  /**
   * Sends `data` to the dev server at `event`, and resolves with what it
   * answers: see page-bridge.ts. Rejects once the server has been silent for
   * a while, unless the request does not `expire`.
   */
  request(event: string, data: object, expires?: boolean): Promise<unknown>;
  /**
   * Hands `news` what the dev server tells the page unasked, like a change of
   * its modules (`tellPages()` in page-bridge.ts), in order with the answers
   * of `request()`: an answer that the server sent after a piece of news
   * resolves after `news` heard it, and a piece of news that the server sent
   * after an answer comes after the answer resolved, or with `missed()`.
   * None in a worker of Node.js, whose page asks for the versions of the
   * modules as a page load starts (`versionOfModules()` of utils.ts).
   */
  listen?(news: PageNews): void;
  /**
   * Where the runners of the page get the modules of an environment, where
   * not over `request()`: in a worker of Node.js from Vitest's own RPC, see
   * vitest-modules.ts.
   */
  readonly modules?: PageModules;
  /**
   * What fires the `navigate` events of the Navigation API for the document:
   * the browser's `navigation`, or a stand-in for a DOM without one. None
   * where the browser has none.
   */
  readonly navigation: EventTarget | undefined;
  /**
   * Whether the document loads a stylesheet that it links, with a `load` or
   * an `error` event: a DOM of Node.js loads none.
   */
  readonly loadsStylesheets: boolean;
  /**
   * Compiles `body` as the body of an async function of `params` in the
   * page's realm, whose globals are the window's: for the modules of the
   * browser layer (utils.ts). In a browser the page's own realm, which the
   * server's layers share; in a worker of Node.js the window's context of
   * `node:vm` (happy-dom-environment.ts), where the server's layers keep the
   * worker's global, with Node's web APIs. The function's source is laid out
   * as `new AsyncFunction(...params, body)` lays it out, line for line.
   */
  compileInPage(params: readonly string[], body: string): (...args: unknown[]) => Promise<unknown>;
  /**
   * Has `answer` answer the requests of the page that do not go through its
   * `fetch`, which the page replaces (browser-context.ts), from now on: where
   * the DOM hands them over, as happy-dom's interceptor does for its
   * `XMLHttpRequest` and the resources it loads, and for what the page's
   * `fetch` leaves to the DOM's. With a response of the page's web APIs, or
   * with none, and the DOM sends the request itself. Whether the DOM hands
   * them over: false for a browser's.
   */
  interceptRequests(answer: (request: Request) => Promise<Response | undefined>): boolean;
  /**
   * The directory of the server's own files, like the cache of Next's build
   * in `.next/`: in a browser the root of the disk in memory, `""`, and in a
   * worker of Node.js, whose disk is the machine's, a directory of the
   * worker's own in the run's temporary directory, gone as Vitest closes.
   */
  readonly serverDir: string;
  /**
   * Runs `callback` in a task of its own after the microtasks, as a server's
   * `setImmediate()`, for the speed feature `immediates`, and in Node.js for
   * every immediate of the server: by a message of one channel in a browser,
   * which no browser delays as it does a timeout, and by Node's own
   * `setImmediate()` in a worker of Node.js, which keeps the stores of Node's
   * `AsyncLocalStorage`, as a message does not. Returns what cancels it.
   */
  serverImmediate(callback: () => void): () => void;
  /**
   * Whether `serverImmediate()` is the runtime's own `setImmediate()`, which
   * Next's server has on `next start`: then server code takes it in every
   * mode. A browser has none, and its server code takes a timeout of no
   * delay, but for the speed feature `immediates`.
   */
  readonly immediatesOfRuntime: boolean;
};

/**
 * The modules of the environments that the page runs, from a source of the
 * host's own: see `modules` of `PageHost`.
 */
export type PageModules = {
  /** What the dev server answers an invoke of a runner of `environment`. */
  invoke(environment: string, payload: InvokePayload): Promise<InvokeResult>;
};

/** What the page hears of the dev server unasked: see `listen()`. */
export type PageNews = {
  /** A piece of news, at `event`. */
  heard(event: string, data: unknown): void;
  /**
   * The host may have missed news, like when its connection closed, or
   * brought it before an answer that the server sent before it.
   */
  missed(): void;
};
