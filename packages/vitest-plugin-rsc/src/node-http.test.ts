import http from "node:http";
import { expect, test, vi } from "vitest";
import { handleRequest, writingOf } from "./nextjs/node-server.ts";
import { registry } from "./nextjs/registry.ts";
import { serverHttpOf } from "./node-http.ts";

vi.mock("./nextjs/cache.ts", () => ({ restoreIncrementalCache: () => {} }));

registry.Response = Response;
registry.serverHttp = serverHttpOf({ Response, Headers });

const request = (init: { method?: string; body?: ReadableStream<Uint8Array> } = {}) => ({
  url: "http://localhost:3000/api/echo?probe=1",
  method: init.method ?? "GET",
  headers: new Headers({ cookie: "seen=1" }),
  body: init.body,
});

// What a route handler returns, written as Next's handler of a route writes
// it (`sendResponse()` of `server/send-response.js`): the status, each
// header, and the body, or `end()` without one, as for a `HEAD`.
const route =
  (answer: () => Response) =>
  async (req: unknown, res: unknown): Promise<void> => {
    const response = answer();
    const out = res as http.ServerResponse;
    out.statusCode = response.status;
    response.headers.forEach((value, name) => out.appendHeader(name, value));
    if (response.body && (req as http.IncomingMessage).method !== "HEAD") {
      for await (const chunk of response.body) out.write(chunk);
    }
    out.end();
  };

test("Next's handler gets Node's own request and response, of the bytes the page sent", async () => {
  let got: { req: unknown; res: unknown; body: string } | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("a "));
      controller.enqueue(new TextEncoder().encode("note"));
      controller.close();
    },
  });
  const response = await handleRequest(request({ method: "POST", body }), {}, async (req, res) => {
    let sent = "";
    for await (const chunk of req as http.IncomingMessage) sent += chunk;
    got = { req, res, body: sent };
    (res as http.ServerResponse).end("ok");
  });
  expect(await response.text()).toBe("ok");
  expect(got!.req).toBeInstanceOf(http.IncomingMessage);
  expect(got!.res).toBeInstanceOf(http.ServerResponse);
  const req = got!.req as http.IncomingMessage;
  expect([req.method, req.url, req.headers.host, req.headers.cookie]).toEqual([
    "POST",
    "/api/echo?probe=1",
    "localhost:3000",
    "seen=1",
  ]);
  expect(got!.body).toBe("a note");
});

test.each([
  ["Response.redirect()", () => Response.redirect("http://localhost:3000/api/echo", 307), 307, ""],
  [
    "a 302 without a body",
    () => new Response(null, { status: 302, headers: { location: "/" } }),
    302,
    "",
  ],
  ["a 200 without a body", () => new Response(null), 200, ""],
  ["a 204", () => new Response(null, { status: 204 }), 204, null],
  ["a 304", () => new Response(null, { status: 304 }), 304, null],
])("a route handler's %s reaches the page", async (_, answer, status, text) => {
  const response = await handleRequest(request(), {}, route(answer));
  expect(response.status).toBe(status);
  // A status without a body has none, as in a browser; the others an empty one.
  expect(response.body === null ? null : await response.text()).toBe(text);
  await writingOf(response)!.written;
});

test("a redirect keeps its location", async () => {
  const response = await handleRequest(
    request(),
    {},
    route(() => Response.redirect("http://localhost:3000/api/echo", 307)),
  );
  expect(response.headers.get("location")).toBe("http://localhost:3000/api/echo");
});

test("the response of a HEAD has no body", async () => {
  const response = await handleRequest(
    request({ method: "HEAD" }),
    {},
    route(() => new Response("not sent")),
  );
  expect(response.status).toBe(200);
  expect(response.body).toBe(null);
  await writingOf(response)!.written;
});

test("each Set-Cookie of a route handler is a header of its own", async () => {
  const response = await handleRequest(
    request(),
    {},
    route(() => {
      const headers = new Headers();
      headers.append("set-cookie", "echo=seen; Path=/");
      headers.append("set-cookie", "next=seen; Path=/; HttpOnly");
      return Response.json({}, { headers });
    }),
  );
  expect(response.headers.getSetCookie()).toEqual([
    "echo=seen; Path=/",
    "next=seen; Path=/; HttpOnly",
  ]);
});

test("a body streams to the page as the route handler writes it", async () => {
  let more!: () => void;
  const later = new Promise<void>((resolve) => (more = resolve));
  const encoder = new TextEncoder();
  const response = await handleRequest(
    request(),
    {},
    route(
      () =>
        new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode("first "));
              await later;
              controller.enqueue(encoder.encode("second"));
              controller.close();
            },
          }),
        ),
    ),
  );
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  // The first part is there before the handler writes the second.
  expect((await reader.read()).value).toBe("first ");
  more();
  let rest = "";
  for (let read = await reader.read(); !read.done; read = await reader.read()) rest += read.value;
  expect(rest).toBe("second");
});

test("a route handler that waits on a page that left sees the client go", async () => {
  const page = new AbortController();
  let closed!: () => void;
  const gone = new Promise<void>((resolve) => (closed = resolve));
  const response = await handleRequest(
    { ...request(), signal: page.signal },
    {},
    async (_, res) => {
      const out = res as http.ServerResponse;
      out.write("<html>");
      out.once("close", closed);
      await gone;
    },
  );
  page.abort();
  await gone;
  await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
});

test("a body that the page cancels takes nothing more of what Node had read", async () => {
  for (let pages = 0; pages < 20; pages++) {
    const response = await handleRequest(request(), {}, async (_, res) => {
      (res as http.ServerResponse).end("<html></html>");
    });
    await response.body!.cancel();
    await writingOf(response)!.written;
  }
});

test("a request that the page leaves before its head fails once Next's handler is done with it", async () => {
  const page = new AbortController();
  let done = false;
  let started!: () => void;
  const running = new Promise<void>((resolve) => (started = resolve));
  const answer = handleRequest({ ...request(), signal: page.signal }, {}, async (_, res) => {
    started();
    await new Promise<void>((resolve) => (res as http.ServerResponse).once("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 20));
    done = true;
  });
  await running;
  page.abort();
  await expect(answer).rejects.toMatchObject({ name: "AbortError" });
  // Its stores have to be there until then.
  expect(done).toBe(true);
});

test("an error that Next destroys a response with after its head reaches the page", async () => {
  const response = await handleRequest(request(), {}, async (_, res) => {
    const out = res as http.ServerResponse;
    out.write("<html>");
    setTimeout(() => out.destroy(new Error("the render failed")));
  });
  await expect(response.text()).rejects.toThrow("the render failed");
});

test("a head of more than Node's 16 KB reaches the page, as a browser takes one", async () => {
  const cookies = Array.from({ length: 5 }, (_, at) => `part${at}=${"x".repeat(4000)}`);
  const response = await handleRequest(
    request(),
    {},
    route(() => {
      const headers = new Headers();
      for (const cookie of cookies) headers.append("set-cookie", cookie);
      return new Response("ok", { headers });
    }),
  );
  expect(response.headers.getSetCookie()).toEqual(cookies);
  expect(await response.text()).toBe("ok");
});

test("a header that Node's http does not take fails the request, and nothing waits on it", async () => {
  await expect(
    handleRequest(
      { ...request(), headers: new Headers({ "x-probe": "a\x01b" }) },
      {},
      route(() => new Response("ok")),
    ),
  ).rejects.toMatchObject({ code: "ERR_INVALID_CHAR" });
  await expect(
    handleRequest(
      request(),
      {},
      route(() => new Response("ok")),
      undefined,
      {
        headers: new Headers({ "x-routed": "a\x7fb" }),
      },
    ),
  ).rejects.toMatchObject({ code: "ERR_INVALID_CHAR" });
});
