import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ViteDevServer } from "vite";
import {
  answerEvent,
  pageNewsPath,
  pageRequestPath,
  toldHeader,
  webSocketQuery,
  type PageAnswer,
  type PageRequest,
} from "./page-protocol.ts";

// What the dev server answers on the channel of page-protocol.ts, and tells
// the page unasked: one table of what it answers, and one list of the pages
// it tells, for both of its channels, the WebSocket of a page in a browser
// and the listener of HTTP of a page in a worker of Node.js. Of the server
// only: nothing of the page imports this file, which imports Node's `http`.

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
 * Each ask is one message each way on the socket the page has open, or one
 * request of HTTP to the plugin's listener. A `fetch()` of the page would be
 * a request through a service worker of the app too, like MSW's.
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

// The pages that the server tells its news, on either channel, and how many
// pieces it told: an answer over HTTP says how many, so a page in Node.js
// hears it after those, as a socket brings it.
type Pages = {
  sockets: Set<{ send(message: string): void }>;
  streams: Set<ServerResponse>;
  told: number;
};
const pagesOf = new WeakMap<ViteDevServer, Pages>();

function pages(server: ViteDevServer): Pages {
  let of = pagesOf.get(server);
  if (!of) pagesOf.set(server, (of = { sockets: new Set(), streams: new Set(), told: 0 }));
  return of;
}

/**
 * Tells every page `data` at `event`, unasked, before any answer that the
 * server sends after it: the page hears it with `listen()` of its host
 * (page-host.ts).
 */
export function tellPages(server: ViteDevServer, event: string, data: unknown): void {
  const to = pages(server);
  to.told++;
  const message = JSON.stringify({ type: "custom", event, data });
  for (const socket of to.sockets) {
    // A socket that is closing: the page asks again on its next one.
    try {
      socket.send(message);
    } catch {}
  }
  const line = `${JSON.stringify({ told: to.told, event, data })}\n`;
  for (const stream of to.streams) stream.write(line);
}

// The result for what the page sent at `event`, or none for an event the
// server does not answer.
async function resultOf(server: ViteDevServer, event: unknown, data: object) {
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
    const { sockets } = pages(server);
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("message", async (raw) => {
      let message: { type?: string; event?: string; data?: { id?: unknown } };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      const { id, ...question } = message.data ?? {};
      if (message.type !== "custom" || typeof id !== "string") return;
      const answered = await resultOf(server, message.event, question);
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
 * Node.js: a POST of a `PageRequest` to `pageRequestPath` gets the result as
 * JSON, a GET of `pageNewsPath` the news of `tellPages()`, and any other
 * request is the dev server's, as for a page that the dev
 * server serves, like the files of the app. One for each dev server, from its
 * first call, until the server closes.
 */
export function listenForPage(server: ViteDevServer): Promise<string> {
  let listening = listeners.get(server);
  if (listening) return listening;
  // The listener's own host, as the page names it.
  let host = "";
  const listener = createServer((request, response) => {
    const asks = request.method === "POST" && request.url === pageRequestPath;
    const listens = request.method === "GET" && request.url === pageNewsPath;
    if (!asks && !listens) {
      server.middlewares(request, response);
      return;
    }
    // Only the page's, as a socket of the page needs Vite's token: a page of
    // another site sends JSON only after a preflight of CORS, which goes to
    // the dev server, and reads no answer through a name of its own that
    // resolves to the loopback.
    if (
      request.headers.host !== host ||
      (asks && request.headers["content-type"] !== "application/json")
    ) {
      response.statusCode = 403;
      response.end("vitest-plugin-rsc: the listener answers the page of its worker only");
      return;
    }
    if (listens) {
      tellPage(server, response);
      return;
    }
    answerRequest(server, request, response).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  // The worker keeps its connections for the next request.
  listener.keepAliveTimeout = 60_000;
  listening = new Promise<string>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const { port } = listener.address() as AddressInfo;
      host = `127.0.0.1:${port}`;
      resolve(`http://${host}`);
    });
  });
  // Keeps no process running, and closes with the server where it has one.
  listener.unref();
  listener.on("connection", (socket) => socket.unref());
  server.httpServer?.once("close", () => listener.close());
  listeners.set(server, listening);
  return listening;
}

async function answerRequest(
  server: ViteDevServer,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const { event, data } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as PageRequest;
  const answered = await resultOf(server, event, data);
  if (!answered) {
    response.statusCode = 404;
    response.end(`vitest-plugin-rsc: the dev server answers nothing at ${String(event)}`);
    return;
  }
  response.setHeader("content-type", "application/json");
  response.setHeader(toldHeader, pages(server).told);
  response.end(JSON.stringify(answered.result ?? null));
}

// The news for a page in a worker of Node.js, from now until it closes: see
// `pageNewsPath`.
function tellPage(server: ViteDevServer, response: ServerResponse): void {
  const { streams, told } = pages(server);
  response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
  response.write(`${JSON.stringify({ told })}\n`);
  streams.add(response);
  response.on("close", () => streams.delete(response));
}
