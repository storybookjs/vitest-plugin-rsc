import type { Agent, ClientRequest, IncomingMessage } from "node:http";
import type { PageHost, PageNews } from "./page-host.ts";
import { pageNewsPath, pageRequestPath, toldHeader } from "./page-protocol.ts";

// The channel of a page in a worker of Node.js to the dev server: its
// questions, to the plugin's own listener of HTTP on the loopback
// (`listenForPage()` in page-bridge.ts), with Node's own `http`, not the
// page's `fetch`, which a test can mock, like MSW does; and the news of the
// server, on a stream of the listener, in order with the answers, as a page
// in a browser hears both on its socket.

// Not an import, which the page's runner would resolve as a module of the
// app's layer.
const http = process.getBuiltinModule("node:http");
// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
// How long an answer waits for the news before it, which the stream brings
// within a turn of the event loop of both processes.
const newsTimeout = 10_000;
// How often a request that the listener reset unread goes again, see
// `unreadOn()`: after a pause that doubles, at a random point in it, so that
// the workers that a full queue reset at once do not come back at once.
const resends = 6;
const pause = (attempt: number) => 10 * 2 ** attempt * (1 + Math.random());

// Whether the listener reset the connection of `request` before it could read
// the request: a new connection beyond its queue of them, which macOS keeps at
// 128 (`kern.ipc.somaxconn`) for every worker together, or a connection kept
// alive that the listener closed as the request went out. Such a request can
// go again: the listener never saw it.
function unreadOn(request: ClientRequest): (error: NodeJS.ErrnoException) => boolean {
  let connected = false;
  let answered = false;
  request.on("socket", (socket) => {
    if (socket.connecting) socket.once("connect", () => (connected = true));
    else connected = true;
  });
  request.on("response", () => (answered = true));
  return (error) =>
    error.code === "ECONNRESET" && !answered && (!connected || request.reusedSocket);
}

/** The channel to the listener at `origin`. */
export function channelTo(origin: string): Pick<PageHost, "request" | "listen"> {
  // A page asks for hundreds of modules at once: over a few connections, each
  // kept for the next request. As many at once as the listener's queue of new
  // connections takes from a few workers.
  const agent: Agent = new http.Agent({ keepAlive: true, maxSockets: 16 });
  const news = listenForNews(`${origin}${pageNewsPath}`);
  return {
    request: async (event, data) => {
      await news.open();
      return post(agent, `${origin}${pageRequestPath}`, JSON.stringify({ event, data }), news);
    },
    listen: news.listen,
  };
}

type News = {
  listen(listener: PageNews): void;
  /** Resolves once the stream is open, which a request waits for. */
  open(): Promise<void>;
  /**
   * Resolves once the page heard the `told` pieces of news that the server
   * told before an answer, which waits for it.
   */
  after(told: number): Promise<void>;
};

// The news of the dev server, on a stream of its own next to the requests:
// see `pageNewsPath`. An answer says how many pieces the server had told as
// it sent it, and waits for those, as a socket would bring them before it.
// The two connections can bring the other order too: news the server told
// after an answer heard before the answer is done, as a few lines of news
// come at once, or the stream is quicker. The page is told it `missed()`
// news then, and asks again: an answer of its own about what the news is of,
// a version of the modules, is older than what it heard.
function listenForNews(url: string): News {
  const listeners = new Set<PageNews>();
  const missed = () => listeners.forEach((listener) => listener.missed());
  let told = 0;
  let waiting: { told: number; resolve: () => void }[] = [];
  let opened: Promise<void> | undefined;
  const release = () => {
    const due = waiting.filter((wait) => wait.told <= told);
    waiting = waiting.filter((wait) => wait.told > told);
    if (due.some((wait) => wait.told < told)) missed();
    for (const wait of due) wait.resolve();
  };
  const open = () => {
    if (opened) return opened;
    const stream: Promise<void> = new Promise<void>((resolve, reject) => {
      const connect = (attempt: number) => {
        const request = http.get(url, { agent: false }, (response: IncomingMessage) => {
          if (response.statusCode !== 200) {
            response.resume();
            gone(
              new Error(`vitest-plugin-rsc: the dev server tells no news: ${response.statusCode}`),
            );
            return;
          }
          let rest = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            if (opened !== stream) return;
            const lines = (rest + chunk).split("\n");
            rest = lines.pop()!;
            for (const line of lines) {
              const piece = JSON.parse(line) as { told: number; event?: string; data?: unknown };
              told = piece.told;
              if (piece.event === undefined) resolve();
              else for (const listener of listeners) listener.heard(piece.event, piece.data);
            }
            release();
          });
          response.on("close", () =>
            gone(new Error("vitest-plugin-rsc: the news of the dev server closed")),
          );
        });
        const unread = unreadOn(request);
        request.on("error", (error) => {
          if (attempt < resends && unread(error)) {
            setTimeout(() => connect(attempt + 1), pause(attempt));
          } else {
            gone(error);
          }
        });
        // Keeps no process running.
        request.on("socket", (socket) => socket.unref());
      };
      // Only the current stream's: one that went sets none of the next.
      const gone = (error: Error) => {
        if (opened !== stream) return;
        opened = undefined;
        // The news of the answers that wait will not come: the page asks
        // again, after every change the server made before.
        missed();
        for (const wait of waiting.splice(0)) wait.resolve();
        reject(error);
      };
      connect(0);
    });
    opened = stream;
    return stream;
  };
  return {
    listen: (listener) => {
      listeners.add(listener);
    },
    open,
    after: (count) => {
      if (!opened) return Promise.resolve();
      if (count < told) missed();
      if (count <= told) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          waiting = waiting.filter((wait) => wait !== waited);
          reject(
            new Error(
              `vitest-plugin-rsc: the dev server told the page ${count} pieces of news before an answer, ` +
                `and the page heard ${told} in ${newsTimeout} ms.`,
            ),
          );
        }, newsTimeout);
        const waited = {
          told: count,
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
        };
        waiting.push(waited);
      });
    },
  };
}

// The listener answers every request: no timeout of the page's own.
function post(agent: Agent, url: string, body: string, news: News, attempt = 0): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      { method: "POST", agent, headers: { "content-type": "application/json" } },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `vitest-plugin-rsc: the dev server answered ${response.statusCode}: ${text}`,
              ),
            );
            return;
          }
          let result: unknown;
          try {
            result = JSON.parse(text);
          } catch (error) {
            reject(error);
            return;
          }
          // An answer that says nothing of the news waits for none.
          const told = Number(response.headers[toldHeader]) || 0;
          news.after(told).then(() => resolve(result), reject);
        });
      },
    );
    const unread = unreadOn(request);
    request.on("error", (error) => {
      if (attempt < resends && unread(error)) {
        setTimeout(() => resolve(post(agent, url, body, news, attempt + 1)), pause(attempt));
      } else {
        reject(error);
      }
    });
    request.end(body);
  });
}
