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
   * resolves after `news` heard it. The page's one listener.
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
   * a browser, and in Node.js its own, which a DOM there replaces.
   */
  readonly serverWebApis: WebApis;
  /**
   * What a request of `serverWebApis` takes of the `init` of the page's: in
   * a DOM of Node.js the page's body, like a `FormData` of a form, and its
   * signal are the DOM's, which Node's `Request` does not take.
   */
  fromPage(init: RequestInit | undefined): RequestInit | undefined;
};

/** What the page hears of the dev server unasked: see `listen()`. */
export type PageNews = {
  /** A piece of news, at `event`. */
  heard(event: string, data: unknown): void;
  /** The host may have missed news, like when its connection closed. */
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
