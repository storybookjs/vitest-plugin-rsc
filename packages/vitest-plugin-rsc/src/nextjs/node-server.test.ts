import { Readable } from "node:stream";
import { expect, test, vi } from "vitest";
import { handleRequest, writingOf } from "./node-server.ts";
import { registry } from "./registry.ts";

vi.mock("virtual:vitest-plugin-rsc/node-stream", () => ({ Readable }));
vi.mock("./cache.ts", () => ({ restoreIncrementalCache: () => {} }));

registry.Response = Response;

// The project runs with `--expose-gc`: see vitest.config.ts.
const { gc } = globalThis as unknown as { gc: () => void };

const request = (signal?: AbortSignal) => ({
  url: "http://localhost/",
  method: "GET",
  headers: new Headers(),
  signal,
});

type NodeResponse = {
  write(chunk: string): void;
  end(chunk: string): void;
  once(event: "close", listener: () => void): void;
  destroyed: boolean;
};

type Read = (answer: Promise<Response>) => Promise<Response | void>;

// Reads the error of a failed read, not `rejects`: that keeps the error, and
// through its stack, until the stack is read, the handler that threw it.
const failureOf = (reading: Promise<unknown>) =>
  reading.then(String, (error: Error) => error.message);

test.each<[string, (res: NodeResponse) => void, Read]>([
  [
    "ends the page",
    (res) => res.end("<html></html>"),
    async (answer) => {
      const response = await answer;
      expect(await response.text()).toBe("<html></html>");
      return response;
    },
  ],
  [
    "fails after the head",
    (res) => {
      res.write("<html>");
      throw new Error("failed after the head");
    },
    async (answer) => {
      const response = await answer;
      expect(await failureOf(response.text())).toBe("failed after the head");
      return response;
    },
  ],
  [
    "fails before the head",
    () => {
      throw new Error("failed before the head");
    },
    async (answer) => {
      expect(await failureOf(answer)).toBe("failed before the head");
    },
  ],
])(
  "lets go of a response once Next's handler, which %s, is done with it, while the signal of its request stays",
  async (_, handle, read) => {
    // A signal that outlives its requests, like the one of a page.
    const page = new AbortController();
    // A separate function, so that no frame of the test keeps the last one.
    async function readResponse(): Promise<WeakRef<object>[]> {
      let res!: NodeResponse;
      const response = await read(
        handleRequest(request(page.signal), {}, async (_, of) => {
          res = of as NodeResponse;
          handle(res);
        }),
      );
      return [new WeakRef(res), ...(response ? [new WeakRef(response)] : [])];
    }
    const kept: WeakRef<object>[] = [];
    for (let pages = 0; pages < 20; pages++) kept.push(...(await readResponse()));

    await expect
      .poll(() => {
        gc();
        // Not the objects themselves: the assertion would keep them.
        return kept.filter((of) => of.deref() !== undefined).length;
      })
      .toBe(0);
    expect(page.signal.aborted).toBe(false);
  },
);

test("ends a response whose request is aborted while the server answers it", async () => {
  const page = new AbortController();
  let res!: NodeResponse;
  const response = await handleRequest(request(page.signal), {}, async (_, of) => {
    res = of as NodeResponse;
    res.write("<html>");
    await new Promise<void>((resolve) => res.once("close", resolve));
  });
  page.abort();

  await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
  expect(res.destroyed).toBe(true);
});

test("closes a response whose handler fails before the head, as a socket would", async () => {
  let closed = false;
  const failure = await failureOf(
    handleRequest(request(), {}, async (_, res) => {
      (res as NodeResponse).once("close", () => (closed = true));
      throw new Error("failed before the head");
    }),
  );
  expect(failure).toBe("failed before the head");
  await expect.poll(() => closed).toBe(true);
});

test("says when the body of a response is written, whole or not", async () => {
  const ended = await handleRequest(request(), {}, async (_, res) => {
    (res as NodeResponse).end("<html></html>");
  });
  await writingOf(ended)!.written;
  expect(await ended.text()).toBe("<html></html>");

  let res!: NodeResponse;
  const cancelled = await handleRequest(request(), {}, async (_, of) => {
    res = of as NodeResponse;
    res.write("<html>");
  });
  await cancelled.body!.cancel();
  await writingOf(cancelled)!.written;
  expect(res.destroyed).toBe(true);
});

test("stops a response as a page that is left does", async () => {
  let res!: NodeResponse;
  const response = await handleRequest(request(), {}, async (_, of) => {
    res = of as NodeResponse;
    res.write("<html>");
  });
  const writing = writingOf(response)!;
  writing.stop();
  await writing.written;

  await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
  expect(res.destroyed).toBe(true);
});

test("has no writing for a response without a body", async () => {
  const response = await handleRequest(request(), {}, async (_, res) => {
    (res as unknown as { statusCode: number }).statusCode = 204;
    (res as NodeResponse).end("");
  });
  expect(response.body).toBe(null);
  expect(writingOf(response)).toBe(undefined);
});

// A request of the page, as Next's handlers of the probe of the notes demo
// get one, with a body that it streams.
const requestOf = (init: { method?: string; body?: ReadableStream<Uint8Array> } = {}) => ({
  url: "http://localhost:3000/api/echo?probe=1",
  method: init.method ?? "GET",
  headers: new Headers({ cookie: "seen=1" }),
  body: init.body,
});

// The part of an `http.ServerResponse` that Next's handler of a route writes.
type RouteResponse = NodeResponse & {
  statusCode: number;
  appendHeader(name: string, value: string): void;
  write(chunk: Uint8Array | string): void;
  end(chunk?: string): void;
};

// What a route handler returns, written as Next's handler of a route writes
// it (`sendResponse()` of `server/send-response.js`): the status, each
// header, and the body, or `end()` without one, as for a `HEAD`.
const route =
  (answer: () => Response) =>
  async (req: unknown, res: unknown): Promise<void> => {
    const response = answer();
    const out = res as RouteResponse;
    out.statusCode = response.status;
    response.headers.forEach((value, name) => out.appendHeader(name, value));
    if (response.body && (req as { method: string }).method !== "HEAD") {
      for await (const chunk of response.body) out.write(chunk);
    }
    out.end();
  };

test("Next's handler gets the request the page sent, with its body", async () => {
  let got: { req: Record<string, unknown>; body: string } | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("a "));
      controller.enqueue(new TextEncoder().encode("note"));
      controller.close();
    },
  });
  const response = await handleRequest(
    requestOf({ method: "POST", body }),
    {},
    async (req, res) => {
      let sent = "";
      for await (const chunk of req as AsyncIterable<Uint8Array>) sent += Buffer.from(chunk);
      got = { req: req as Record<string, unknown>, body: sent };
      (res as RouteResponse).end("ok");
    },
  );
  expect(await response.text()).toBe("ok");
  const { req } = got!;
  const headers = req.headers as Record<string, string>;
  expect([req.method, req.url, headers.host, headers.cookie]).toEqual([
    "POST",
    "/api/echo?probe=1",
    "localhost:3000",
    "seen=1",
  ]);
  expect(got!.body).toBe("a note");
});

test.each([
  ["Response.redirect()", () => Response.redirect("http://localhost:3000/api/echo", 307), 307],
  [
    "a 302 without a body",
    () => new Response(null, { status: 302, headers: { location: "/" } }),
    302,
  ],
  ["a 200 without a body", () => new Response(null), 200],
  ["a 204", () => new Response(null, { status: 204 }), 204],
  ["a 304", () => new Response(null, { status: 304 }), 304],
])("a route handler's %s reaches the page", async (_, answer, status) => {
  const response = await handleRequest(requestOf(), {}, route(answer));
  expect(response.status).toBe(status);
  // Nothing was written: the stand-in's response has no body.
  expect(response.body).toBe(null);
  expect(writingOf(response)).toBe(undefined);
});

test("a redirect keeps its location", async () => {
  const response = await handleRequest(
    requestOf(),
    {},
    route(() => Response.redirect("http://localhost:3000/api/echo", 307)),
  );
  expect(response.headers.get("location")).toBe("http://localhost:3000/api/echo");
});

test("the response of a HEAD has no body", async () => {
  const response = await handleRequest(
    requestOf({ method: "HEAD" }),
    {},
    route(() => new Response("not sent")),
  );
  expect(response.status).toBe(200);
  expect(response.body).toBe(null);
});

test("each Set-Cookie of a route handler is a header of its own", async () => {
  const response = await handleRequest(
    requestOf(),
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
    requestOf(),
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

test("a body that the page cancels takes nothing more of what the handler writes", async () => {
  let res!: RouteResponse & { write(chunk: string): boolean };
  const response = await handleRequest(request(), {}, async (_, of) => {
    res = of as typeof res;
    res.write("<html>");
  });
  await response.body!.cancel();
  expect(res.write("</html>")).toBe(false);
  await writingOf(response)!.written;
});

test("a request that the page leaves before its head fails once Next's handler is done with it", async () => {
  const page = new AbortController();
  let done = false;
  let started!: () => void;
  const running = new Promise<void>((resolve) => (started = resolve));
  const answer = handleRequest(request(page.signal), {}, async (_, res) => {
    started();
    await new Promise<void>((resolve) => (res as NodeResponse).once("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 20));
    done = true;
  });
  await running;
  page.abort();
  await expect(answer).rejects.toMatchObject({ name: "AbortError" });
  // Its stores have to be there until then.
  expect(done).toBe(true);
});

test("a request that the page leaves before its head has no head when Next's handler ends it later", async () => {
  const page = new AbortController();
  let started!: () => void;
  const running = new Promise<void>((resolve) => (started = resolve));
  const answer = handleRequest(request(page.signal), {}, async (_, of) => {
    const res = of as RouteResponse;
    started();
    await new Promise<void>((resolve) => res.once("close", resolve));
    res.end();
  });
  await running;
  page.abort();
  await expect(answer).rejects.toMatchObject({ name: "AbortError" });
});

test("an error that Next destroys a response with after its head reaches the page", async () => {
  const response = await handleRequest(request(), {}, async (_, res) => {
    const out = res as NodeResponse & { destroy(error: Error): void };
    out.write("<html>");
    setTimeout(() => out.destroy(new Error("the render failed")));
  });
  await expect(response.text()).rejects.toThrow("the render failed");
});

test("a head of many large Set-Cookie headers reaches the page", async () => {
  const cookies = Array.from({ length: 5 }, (_, at) => `part${at}=${"x".repeat(4000)}`);
  const response = await handleRequest(
    requestOf(),
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
