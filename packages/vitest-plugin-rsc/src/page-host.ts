// What the page needs of the host it runs in, which the plugin chooses for a
// run (index.ts): a browser, as in Vitest's Browser Mode, Storybook or a
// static build (browser-host.ts), or a worker of Node.js with a DOM of
// happy-dom or jsdom, without Browser Mode (node-host.ts). The page's modules
// import it as `virtual:vitest-plugin-rsc/page-host`, and nothing else of the
// page tells the two apart.

import type { InvokePayload, InvokeResult } from "./built-layers.ts";
import type { ServerRequest } from "./nextjs/registry.ts";

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
   * The web APIs of the server's layers, whose requests and responses keep
   * the headers that a browser's drop (nextjs/globals.ts): the page's own in
   * a browser, and in Node.js the runtime's own, which a DOM there replaces
   * on the global the page and the server share.
   */
  readonly serverWebApis: WebApis;
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
   * `setImmediate()`, for the speed feature `immediates`: by a message of one
   * channel in a browser, which no browser delays as it does a timeout, and
   * by Node's own `setImmediate()` in a worker of Node.js, which keeps the
   * stores of Node's `AsyncLocalStorage`, as a message does not. Returns what
   * cancels it.
   */
  serverImmediate(callback: () => void): () => void;
  /**
   * Has `respond`, Next's request handler, answer `request` on Node's own
   * `http`, as `next start` does: in a worker of Node.js over a socket in
   * memory (node-http.ts). None in a browser, which has no `http`: there
   * Next's stand-in of a response takes the request (nextjs/node-server.ts).
   */
  readonly serverHttp?: ServerHttp;
};

/**
 * The modules of the environments that the page runs, from a source of the
 * host's own: see `modules` of `PageHost`.
 */
export type PageModules = {
  /** What the dev server answers an invoke of a runner of `environment`. */
  invoke(environment: string, payload: InvokePayload): Promise<InvokeResult>;
};

/**
 * Sends `request` to `respond` as an `http.IncomingMessage` and an
 * `http.ServerResponse`, and resolves with the response once its head is
 * there, while `respond` goes on to write the body.
 */
export type ServerHttp = (request: ServerRequest, respond: Respond) => Promise<Served>;

/** Next's request handler of a route, on the `req` and `res` of a request. */
export type Respond = (req: unknown, res: unknown) => Promise<unknown>;

/** The response to a request, and how its body is written, if it has one. */
export type Served = { response: Response; writing: Writing | undefined };

/**
 * How the body of a response is written: `written` resolves once it ends,
 * whole or not, and `stop` ends it as a page that is left does. The server
 * writes on whether it is read or not: nothing waits for a reader.
 */
export type Writing = { written: Promise<void>; stop: () => void };

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

/** The web APIs that a server and a browser both have, and Node.js its own of. */
export type WebApis = {
  Request: typeof Request;
  Response: typeof Response;
  Headers: typeof Headers;
  FormData: typeof FormData;
  Blob: typeof Blob;
  File: typeof File;
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
  fetch: typeof fetch;
};
