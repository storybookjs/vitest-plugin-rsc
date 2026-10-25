import type { Agent, IncomingMessage } from "node:http";
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

/** The channel to the listener at `origin`. */
export function channelTo(origin: string): Pick<PageHost, "request" | "listen"> {
  // A page asks for hundreds of modules at once: over a few connections, each
  // kept for the next request.
  const agent: Agent = new http.Agent({ keepAlive: true });
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
  /** Resolves once the page heard the news that the server told before an answer. */
  heard(told: number): Promise<void>;
};

// The news of the dev server, on a stream of its own next to the requests:
// see `pageNewsPath`. An answer says how many pieces the server had told as
// it sent it, and waits for those, as a socket would bring them before it.
function listenForNews(url: string): News {
  let listener: PageNews | undefined;
  let told = 0;
  let waiting: { told: number; resolve: () => void }[] = [];
  let opened: Promise<void> | undefined;
  const release = () => {
    const due = waiting.filter((wait) => wait.told <= told);
    waiting = waiting.filter((wait) => wait.told > told);
    for (const wait of due) wait.resolve();
  };
  const open = () =>
    (opened ??= new Promise<void>((resolve, reject) => {
      const request = http.get(url, { agent: false }, (response: IncomingMessage) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(`vitest-plugin-rsc: the dev server tells no news: ${response.statusCode}`),
          );
          return;
        }
        let rest = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          const lines = (rest + chunk).split("\n");
          rest = lines.pop()!;
          for (const line of lines) {
            const piece = JSON.parse(line) as { told: number; event?: string; data?: unknown };
            told = piece.told;
            if (piece.event === undefined) resolve();
            else listener?.heard(piece.event, piece.data);
          }
          release();
        });
        response.on("close", () => {
          opened = undefined;
          // The news of the answers that wait will not come: the page asks
          // again, after every change the server made before.
          listener?.missed();
          for (const wait of waiting.splice(0)) wait.resolve();
          reject(new Error("vitest-plugin-rsc: the news of the dev server closed"));
        });
      });
      request.on("error", (error) => {
        opened = undefined;
        reject(error);
      });
      // Keeps no process running.
      request.on("socket", (socket) => socket.unref());
    }));
  return {
    listen: (news) => {
      listener = news;
    },
    open,
    heard: (count) =>
      count <= told || !opened
        ? Promise.resolve()
        : new Promise((resolve) => waiting.push({ told: count, resolve })),
  };
}

// The listener answers every request: no timeout of the page's own.
function post(agent: Agent, url: string, body: string, news: News): Promise<unknown> {
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
          void news.heard(Number(response.headers[toldHeader])).then(() => resolve(result));
        });
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}
