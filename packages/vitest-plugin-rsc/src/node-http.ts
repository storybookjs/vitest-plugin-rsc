import type { ClientRequest as Outgoing, IncomingMessage, Server, ServerResponse } from "node:http";
import type { ServerHttp, WebApis } from "./page-host.ts";

// The server's `http` in a worker of Node.js: Node's own server and client,
// on a connection in memory for each request, without a port. Next's request
// handler gets the `http.IncomingMessage` that Node's server parses of the
// bytes the page sent, and the `http.ServerResponse` that writes the bytes of
// its answer, as on `next start`. The page gets the response as Node's
// client parses it: without a body for a status that has none and for a
// `HEAD`, the body as it streams, each `Set-Cookie` a header of its own. A
// page that is left closes its connection, which Next sees as a client that
// went away.

// Not imports, which the page's runner would resolve as modules of the app's
// layer.
const http = process.getBuiltinModule("node:http");
const { duplexPair } = process.getBuiltinModule("node:stream");
// Node's client as the host loads, before a test's mock of the network
// replaces it, like MSW's `setupServer()`: a request of the page to its own
// server is not one to the network, and the mock would send it to a port.
// The plugin's setup file loads this before the project's: a mock that is
// set up before it, like in a module that Node preloads, gets the requests.
const { ClientRequest } = http;

const leftBeforeSent = () =>
  new DOMException("The page was left before the server had sent it.", "AbortError");

// What answers the request that comes on a connection, by the server's end.
const answers = new WeakMap<object, (req: IncomingMessage, res: ServerResponse) => void>();
// One server for every request, which never listens.
let server: Server | undefined;
const serverOf = () =>
  (server ??= http.createServer((req, res) => answers.get(req.socket)?.(req, res)));

// The statuses whose response has no body, of the Fetch standard. Node's
// client takes a 101 and a 103 for an upgrade and for information, not for
// a response.
const nullBody = new Set([101, 103, 204, 205, 304]);
// What a browser takes of the head of a response, cookies and all: more than
// the 16 KB of Node's client.
const maxHeaderSize = 256 * 1024;

/** The server's `http`, with responses of the web APIs of the server, Node's. */
export const serverHttpOf =
  ({ Response, Headers }: Pick<WebApis, "Response" | "Headers">): ServerHttp =>
  (request, respond) =>
    new Promise((resolve, reject) => {
      const [page, socket] = duplexPair();
      // Whether the connection was closed here: for a page that left, or for
      // a handler that is done without a head. An error of Node's client
      // without that is its own, like a head that is too large.
      let closing = false;
      // A connection closes at both ends: the pair of streams does not say so
      // to the other end itself.
      const close = () => {
        closing = true;
        page.destroy();
        socket.destroy();
      };
      page.once("close", close);
      socket.once("close", close);
      const leave = () => {
        closing = true;
        page.destroy();
      };

      // What ended the response before all of it went out: the handler's
      // error, the one Next destroyed the response with, or one of Node's
      // client. Without one, the page left.
      let failure: unknown;
      const failed = () => failure ?? leftBeforeSent();
      // Next's handler is done with the request, often long after the head. A
      // request that fails before its head fails once the handler is done with
      // it: its stores have to be there until then.
      let handled: Promise<unknown> | undefined;
      const failBeforeHead = (error: unknown) => {
        if (!closing) failure ??= error;
        const fail = () => reject(failed());
        void (handled ?? Promise.resolve()).then(fail, fail);
      };

      let ended!: () => void;
      const written = new Promise<void>((resolve) => (ended = resolve));
      socket.once("close", () => ended());
      // The connection is the page's for this request only: it closes once
      // the server is done with the response and the page has all of it.
      let sides = 0;
      const closeOnceDone = () => {
        if (++sides === 2) close();
      };

      const url = new URL(request.url);
      let outgoing: Outgoing;
      try {
        outgoing = new ClientRequest({
          createConnection: () => page,
          method: request.method,
          path: url.pathname + url.search,
          maxHeaderSize,
          // A browser asks to keep its connection open.
          headers: {
            host: url.host,
            connection: "keep-alive",
            ...Object.fromEntries(request.headers),
          },
        });
      } catch (error) {
        // A header that the web's `Headers` takes and Node's `http` does not.
        close();
        reject(error);
        return;
      }

      answers.set(socket, (req, res) => {
        res.once("close", () => {
          // Next destroys a response with the error of a render that fails
          // after its head.
          failure ??= res.errored ?? undefined;
          ended();
          closeOnceDone();
        });
        handled = new Promise((resolve) => resolve(respond(req, res))).then(
          // Ended without a head: the request fails.
          () => {
            if (!res.headersSent) close();
          },
          // Before the head the request fails with the error, after it the
          // body does.
          (error: unknown) => {
            failure ??= error;
            if (!res.headersSent) close();
            else res.destroy();
          },
        );
      });
      serverOf().emit("connection", socket);

      // Whoever asked can leave until the connection closes, and no longer: the
      // signal can outlive the request, like the one of a page.
      const { signal } = request;
      signal?.addEventListener("abort", leave, { once: true });
      page.once("close", () => signal?.removeEventListener("abort", leave));

      outgoing.on("error", failBeforeHead);
      outgoing.once("response", (incoming) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          for (const each of Array.isArray(value) ? value : [value]) headers.append(name, each!);
        }
        const init = { status: incoming.statusCode, statusText: incoming.statusMessage, headers };
        incoming.on("error", () => {});
        incoming.once("end", closeOnceDone);
        if (nullBody.has(incoming.statusCode!) || request.method === "HEAD") {
          incoming.resume();
          resolve({ response: new Response(null, init), writing: { written, stop: leave } });
          return;
        }
        // Read as it comes, as a browser does: the server writes on whether
        // the page reads or not.
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        // Until the body ends, whole, failed or cancelled: Node may still
        // hand over what it had read before the connection closed.
        let open = true;
        const endBody = (end: () => void) => {
          if (open) end();
          open = false;
        };
        const body = new ReadableStream<Uint8Array>({
          start: (c) => void (controller = c),
          // Whoever reads the response has left, like a browser that leaves
          // a page.
          cancel() {
            endBody(() => {});
            leave();
          },
        });
        incoming.on("data", (chunk: Buffer) => {
          if (open) {
            controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
          }
        });
        incoming.once("end", () => endBody(() => controller.close()));
        incoming.once("close", () => endBody(() => controller.error(failed())));
        // The render ends as an abort, which is what a browser that leaves a
        // page is to a server: Next does not report it as an error of the app.
        const stop = () => {
          endBody(() => controller.error(AbortSignal.abort().reason));
          leave();
        };
        resolve({ response: new Response(body, init), writing: { written, stop } });
      });

      const { body } = request;
      if (!body) outgoing.end();
      else if (body instanceof Uint8Array) outgoing.end(body);
      else void sendBody(body.getReader(), outgoing);
    });

// The body of a request, as the page streams it, until the connection closes.
async function sendBody(reader: ReadableStreamDefaultReader<Uint8Array>, outgoing: Outgoing) {
  outgoing.once("close", () => void reader.cancel().catch(() => {}));
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      outgoing.write(read.value);
    }
    outgoing.end();
  } catch (error) {
    outgoing.destroy(error instanceof Error ? error : undefined);
  }
}
