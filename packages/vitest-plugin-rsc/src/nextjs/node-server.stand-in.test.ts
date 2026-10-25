import { expect, test, vi } from "vitest";
import {
  generateETag,
  NodeNextResponse,
  RenderResult,
  sendRenderResult,
  sendResponse,
} from "./compat/ssr/senders.ts";
import { handleRequest, writingOf } from "./node-server.ts";
import { registry } from "./registry.ts";

vi.mock("./cache.ts", () => ({ restoreIncrementalCache: () => {} }));

registry.Response = Response;

// The answers of Next's handlers on the stand-in for an
// `http.ServerResponse`, the browser host's, here on Node's own streams:
// their `finish` comes on a `nextTick`, after Next's handler is done, where
// the browser's comes a microtask after `end()`. The head is the stand-in's
// to take at `end()`, on either.

type Out = {
  write(chunk: string): void;
  once(event: "close", listener: () => void): void;
  destroy(error?: Error): void;
};

const request = (init: { method?: string; headers?: HeadersInit; signal?: AbortSignal } = {}) => ({
  url: "http://localhost:3000/api/echo",
  method: init.method ?? "GET",
  headers: new Headers(init.headers),
  signal: init.signal,
});

// What a route handler returns, written by Next's handler of a route.
const route =
  (answer: () => Response) =>
  async (req: unknown, res: unknown): Promise<void> => {
    await sendResponse(req as never, new NodeNextResponse(res as never), answer());
  };

// A page that Next prerendered, sent by its handler of a page.
const prerendered =
  (html: string) =>
  async (req: unknown, res: unknown): Promise<void> => {
    await sendRenderResult({
      req: req as never,
      res: res as never,
      result: RenderResult.fromStatic(html, "text/html; charset=utf-8"),
      generateEtags: true,
      poweredByHeader: false,
      cacheControl: undefined,
    });
  };

test.each([
  ["Response.redirect()", () => Response.redirect("http://localhost:3000/", 307), 307],
  [
    "a 302 without a body",
    () => new Response(null, { status: 302, headers: { location: "/" } }),
    302,
  ],
  ["a 200 without a body", () => new Response(null), 200],
  ["a 204", () => new Response(null, { status: 204 }), 204],
  ["a 304", () => new Response(null, { status: 304 }), 304],
])("a route handler's %s reaches the page, without a body", async (_, answer, status) => {
  const response = await handleRequest(request(), {}, route(answer));
  expect(response.status).toBe(status);
  expect(response.body).toBe(null);
  expect(writingOf(response)).toBe(undefined);
});

test("a redirect keeps its location", async () => {
  const response = await handleRequest(
    request(),
    {},
    route(() => Response.redirect("http://localhost:3000/", 307)),
  );
  expect(response.headers.get("location")).toBe("http://localhost:3000/");
});

test("the response of a HEAD has no body", async () => {
  const response = await handleRequest(
    request({ method: "HEAD" }),
    {},
    route(() => new Response("not sent")),
  );
  expect(response.status).toBe(200);
  expect(response.body).toBe(null);
});

test("the response of a HEAD of a prerendered page has no body", async () => {
  const response = await handleRequest(
    request({ method: "HEAD" }),
    {},
    prerendered("<html></html>"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-length")).toBe("13");
  expect(response.body).toBe(null);
});

test("a prerendered page that the browser has answers with a 304", async () => {
  const response = await handleRequest(
    request({ headers: { "if-none-match": generateETag("<html></html>") } }),
    {},
    prerendered("<html></html>"),
  );
  expect(response.status).toBe(304);
  expect(response.body).toBe(null);
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
  await writingOf(response)!.written;
});

test("a request that the page leaves before its head fails once Next's handler is done with it", async () => {
  const page = new AbortController();
  let done = false;
  let started!: () => void;
  const running = new Promise<void>((resolve) => (started = resolve));
  const answer = handleRequest(request({ signal: page.signal }), {}, async (_, res) => {
    started();
    await new Promise<void>((resolve) => (res as Out).once("close", resolve));
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
    const out = res as Out;
    out.write("<html>");
    setTimeout(() => out.destroy(new Error("the render failed")));
  });
  await expect(response.text()).rejects.toThrow("the render failed");
});
