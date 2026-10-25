import type { ViteDevServer } from "vite";

// What the page and the dev server share of the websocket between them, which
// the runners of the page fetch their modules over (see utils.ts and
// index.ts). The page sends `{ type: "custom", event, data: { id, ... } }`,
// and the server answers at `answerEvent` with `{ id, result }`.

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
 * Answers what the page asks at `event`, with `askDevServer()` of utils.ts.
 * Each ask is one message each way on the socket the page has open. A
 * `fetch()` would be a request of HTTP, through a service worker of the app
 * too, like MSW's.
 */
export function answerPage<Question extends object>(
  server: ViteDevServer,
  event: string,
  answer: (question: Question) => unknown,
): void {
  server.ws.on(event, async (data: (Question & { id?: unknown }) | undefined, client) => {
    // Not a question of the page.
    if (typeof data?.id !== "string") return;
    const { id, ...question } = data;
    let result: PageAnswer<unknown>;
    try {
      result = { answer: await answer(question as unknown as Question) };
    } catch (error) {
      server.config.logger.error(`vitest-plugin-rsc: ${event} failed. ${String(error)}`);
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    client.send(answerEvent, { id, result });
  });
}
