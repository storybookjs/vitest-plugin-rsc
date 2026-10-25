// What the page and the dev server share of the channel between them, which
// the runners of the page fetch their modules over (see utils.ts and
// index.ts): the page sends `{ type: "custom", event, data: { id, ... } }`,
// and the server answers at `answerEvent` with `{ id, result }`. On the
// WebSocket of a page in a browser (browser-host.ts), or, for a page in a
// worker of Node.js, where Vitest has no WebSocket without Browser Mode, a
// listener of HTTP of the plugin's own (node-channel.ts). Names and types only:
// the page imports this file, in a browser too, and the server's side of the
// channel, with Node's `http`, is page-bridge.ts.

/** Where the page asks for the token and the path of the socket. */
export const webSocketInfoPath = "/@vite/react-client-runner-websocket";
/** The query that tells the socket of the page from Vite's own. */
export const webSocketQuery = "vitest-plugin-rsc-react-client";
/** Where the page sends an invoke of a runner, for an environment. */
export const invokeEvent = "vitest-plugin-rsc:react-client:invoke";
/** Where the page asks for the version of the modules of an environment. */
export const versionEvent = "vitest-plugin-rsc:react-client:version";
/**
 * Where the page asks which modules of an environment changed after a
 * version of them: their ids.
 */
export const changedEvent = "vitest-plugin-rsc:react-client:changed";
export type ChangedQuestion = { environment: string; since: number };
/**
 * Where the dev server tells the page that Vite invalidated modules of an
 * environment, with their version from then on: see `onInvalidation()` in
 * module-versions.ts.
 */
export const modulesChangedEvent = "vitest-plugin-rsc:react-client:modules-changed";
export type ModulesChanged = { environment: string; version: number };
/** Where the dev server answers what the page asks over the websocket. */
export const answerEvent = "vitest-plugin-rsc:react-client:invoke-result";

/** What `answerPage()` sends: the answer, or why there is none. */
export type PageAnswer<T> = { answer: T } | { error: string };

/** What the page sends over HTTP, to the listener of `listenForPage()`. */
export type PageRequest = { event: string; data: object };
/** Where the listener of `listenForPage()` takes a `PageRequest`. */
export const pageRequestPath = "/@vitest-plugin-rsc/page-request";
/**
 * Where a page in a worker of Node.js listens to the news of the dev server,
 * which a page in a browser hears on its socket: a line of JSON for each
 * piece, `{ told, event, data }`, after a first line `{ told }`. `told` is
 * how many pieces the server had told by then.
 */
export const pageNewsPath = "/@vitest-plugin-rsc/page-news";
/**
 * The header of an answer of the listener: how many pieces of news the server
 * had told as it sent the answer, which the page hears before the answer.
 */
export const toldHeader = "x-vitest-plugin-rsc-told";
