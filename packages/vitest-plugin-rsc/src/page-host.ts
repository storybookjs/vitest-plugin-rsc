// What the page needs of the host it runs in, which the plugin chooses for a
// run (index.ts): a browser, as in Vitest's Browser Mode, Storybook or a
// static build (browser-host.ts), or a worker of Node.js with a DOM of
// happy-dom or jsdom, without Browser Mode (node-host.ts). The page's modules
// import it as `virtual:vitest-plugin-rsc/page-host`, and nothing else of the
// page tells the two apart.

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
   */
  listen(news: PageNews): void;
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
   * Has `answer` answer the page's requests from now on, where the DOM hands
   * them over itself, as happy-dom's interceptor does for its `fetch`,
   * `XMLHttpRequest` and the resources it loads: with a response, of the
   * page's web APIs or the server's, which the host gives the DOM as one of
   * its own, or with none, and the DOM sends the request itself. False where
   * it does not, and the page's `fetch` is the one to replace
   * (browser-context.ts).
   */
  interceptRequests(answer: (request: Request) => Promise<Response | undefined>): boolean;
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
