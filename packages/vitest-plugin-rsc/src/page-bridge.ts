import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ViteDevServer } from "vite";
import { answerEvent, webSocketQuery, type PageAnswer } from "./page-protocol.ts";

// What the dev server answers on the channel of page-protocol.ts, and tells
// the page unasked: one table of what it answers, for the WebSocket of a page
// in a browser and the worker's channel of a page in Node.js (worker-pool.ts),
// and the pages in a browser that it tells. And the origin of a page in
// Node.js, the dev server's files on the loopback. Of the server only:
// nothing of the page imports this file, which imports Node's `http`.

// What the server answers, by event, with the result it sends.
type Answers = Map<string, (question: object) => unknown>;
const answersOf = new WeakMap<ViteDevServer, Answers>();

function answers(server: ViteDevServer): Answers {
  let table = answersOf.get(server);
  if (!table) answersOf.set(server, (table = new Map()));
  return table;
}

/**
 * Answers what the page asks at `event` with what `result()` gives, as it
 * is: the page's own transport of modules, see index.ts.
 */
export function answerPageWith<Question extends object>(
  server: ViteDevServer,
  event: string,
  result: (question: Question) => unknown,
): void {
  answers(server).set(event, result as (question: object) => unknown);
}

/**
 * Answers what the page asks at `event`, with `askDevServer()` of utils.ts.
 * Each ask is one message each way on the socket the page has open, or on
 * the channel of its worker. A `fetch()` of the page would be a request
 * through a service worker of the app too, like MSW's.
 */
export function answerPage<Question extends object>(
  server: ViteDevServer,
  event: string,
  answer: (question: Question) => unknown,
): void {
  answerPageWith(server, event, async (question: Question): Promise<PageAnswer<unknown>> => {
    try {
      return { answer: await answer(question) };
    } catch (error) {
      server.config.logger.error(`vitest-plugin-rsc: ${event} failed. ${String(error)}`);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
}

// The sockets of the pages in a browser, which the server tells its news.
const socketsOf = new WeakMap<ViteDevServer, Set<{ send(message: string): void }>>();

function sockets(server: ViteDevServer) {
  let of = socketsOf.get(server);
  if (!of) socketsOf.set(server, (of = new Set()));
  return of;
}

/**
 * Tells every page in a browser `data` at `event`, unasked, before any answer
 * that the server sends after it: the page hears it with `listen()` of its
 * host (page-host.ts). A page in Node.js asks for the versions as a page load
 * starts (`versionOfModules()` of utils.ts).
 */
export function tellPages(server: ViteDevServer, event: string, data: unknown): void {
  const message = JSON.stringify({ type: "custom", event, data });
  for (const socket of sockets(server)) {
    // A socket that is closing: the page asks again on its next one.
    try {
      socket.send(message);
    } catch {}
  }
}

/**
 * The result for what the page sent at `event`, or none for an event the
 * server does not answer.
 */
export async function answerOf(server: ViteDevServer, event: unknown, data: object) {
  const answer = typeof event === "string" ? answersOf.get(server)?.get(event) : undefined;
  return answer && { result: await answer(data) };
}

/**
 * Answers the questions of the page on its socket: the one with
 * `webSocketQuery`, of the page's runners, not Vite's own.
 */
export function answerPageOverWebSocket(server: ViteDevServer): void {
  server.ws.on("connection", (socket, req) => {
    const url = new URL(req.url ?? "/", "https://any.local");
    if (url.searchParams.get(webSocketQuery) !== "1") return;
    const open = sockets(server);
    open.add(socket);
    socket.on("close", () => open.delete(socket));
    socket.on("message", async (raw) => {
      let message: { type?: string; event?: string; data?: { id?: unknown } };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      const { id, ...question } = message.data ?? {};
      if (message.type !== "custom" || typeof id !== "string") return;
      const answered = await answerOf(server, message.event, question);
      if (!answered) return;
      socket.send(
        JSON.stringify({ type: "custom", event: answerEvent, data: { id, ...answered } }),
      );
    });
  });
}

const listeners = new WeakMap<ViteDevServer, Promise<string>>();

/**
 * The origin of a listener of HTTP on the loopback, for a page in a worker of
 * Node.js: the dev server's, as for a page that the dev server serves, like
 * the files of the app, which Vitest's dev server serves without listening
 * itself. One for each dev server, from its first call, until the server
 * closes.
 */
export function listenForPage(server: ViteDevServer): Promise<string> {
  let listening = listeners.get(server);
  if (listening) return listening;
  const listener = createServer((request, response) => server.middlewares(request, response));
  // The worker keeps its connections for the next request.
  listener.keepAliveTimeout = 60_000;
  listening = new Promise<string>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const { port } = listener.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
  // Keeps no process running, and closes with the server where it has one.
  listener.unref();
  listener.on("connection", (socket) => socket.unref());
  server.httpServer?.once("close", () => listener.close());
  listeners.set(server, listening);
  return listening;
}
