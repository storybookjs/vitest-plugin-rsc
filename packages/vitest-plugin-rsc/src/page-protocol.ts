// What the page and the dev server share of the channel between them, which
// the runners of the page fetch their modules over (see utils.ts and
// index.ts): the page sends `{ type: "custom", event, data: { id, ... } }`,
// and the server answers at `answerEvent` with `{ id, result }`, on the
// WebSocket of a page in a browser (browser-host.ts). A page in a worker of
// Node.js, where Vitest has no WebSocket without Browser Mode, gets its
// modules from Vitest's RPC, and asks the rest on the worker's channel to
// Vitest's process (worker-channel.ts). Names and types only: the page
// imports this file, in a browser too, and the server's side is
// page-bridge.ts.

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

/**
 * What a page in a worker of Node.js asks on the worker's channel to Vitest's
 * process, next to Vitest's own messages, and the plugin's pool answers there
 * (worker-pool.ts): `{ [questionKey]: id, event, data }`, answered with
 * `{ [answerKey]: id, result }`, or `error` where the server answers nothing
 * at `event`.
 */
export const questionKey = "vitest-plugin-rsc:question";
export const answerKey = "vitest-plugin-rsc:answer";
export type WorkerQuestion = { [questionKey]: number; event: string; data: object };
export type WorkerAnswer = { [answerKey]: number; result?: unknown; error?: string };

/** Whether a message of a worker's channel is a question of the page's. */
export const isQuestion = (message: unknown): message is WorkerQuestion =>
  typeof message === "object" && message !== null && questionKey in message;
/** Whether a message of a worker's channel is an answer to the page. */
export const isAnswer = (message: unknown): message is WorkerAnswer =>
  typeof message === "object" && message !== null && answerKey in message;
