// @vitest-environment happy-dom
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// The host of a page in a worker of Node.js with happy-dom: the page's fetch
// API stays happy-dom's, and its interceptor hands the requests that happy-dom
// sends itself, like those of `XMLHttpRequest`, to what answers them.

// What worker-web-apis.ts keeps with `--import`, which this test has not: the
// server's web APIs are not what it is about.
vi.hoisted(() => {
  (globalThis as Record<PropertyKey, unknown>)[Symbol.for("vitest-plugin-rsc:worker-web-apis")] =
    globalThis;
});

const { nodeHost } = await import("./node-host.ts");

// Where the requests that nobody answers go.
const network = createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.end(`network ${request.url}`);
});
beforeAll(() => new Promise<void>((resolve) => network.listen(0, "127.0.0.1", resolve)));
afterAll(() => network.close());

// An interceptor of the test's, from before the host's: it gets what the
// host's leaves.
const before: Request[] = [];
const { happyDOM } = window as unknown as {
  happyDOM: { settings: any; waitUntilComplete(): Promise<void> };
};
const { settings } = happyDOM;
settings.fetch.interceptor = {
  beforeAsyncRequest: async ({ request }: { request: Request }) => {
    before.push(request);
    if (request.url.includes("/mocked")) return new Response("mocked by the test");
  },
};

const asked: Request[] = [];
const handsOver = nodeHost("http://127.0.0.1:1", os.tmpdir()).interceptRequests(async (request) => {
  asked.push(request);
  if (request.url.includes("/network") || request.url.includes("/mocked")) return undefined;
  // An answer that fails as its request is aborted, as the app's does.
  if (request.url.includes("/slow")) {
    return new Promise((_, reject) =>
      request.signal.addEventListener("abort", () => reject(request.signal.reason)),
    );
  }
  return new Response(`answer of ${request.method} ${new URL(request.url).pathname}`, {
    status: 201,
    headers: { "content-type": "text/plain" },
  });
});

test("hands over a request of XMLHttpRequest", async () => {
  expect(handsOver).toBe(true);
  const request = new XMLHttpRequest();
  await new Promise((resolve) => {
    request.onloadend = resolve;
    request.open("GET", "/xhr");
    request.send();
  });
  expect(asked.at(-1)).toBeInstanceOf(Request);
  expect(request.status).toBe(201);
  expect(request.getResponseHeader("content-type")).toBe("text/plain");
  expect(request.responseText).toBe("answer of GET /xhr");
});

test("hands over a form with a file as the bytes of a form of the DOM's", async () => {
  const form = new FormData();
  form.append("title", "a note");
  form.append("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
  await fetch("/upload", { method: "POST", body: form });
  const request = asked.at(-1)!;
  expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
  const body = await request.text();
  expect(body).toContain('name="file"; filename="hello.txt"');
  expect(body).toContain("hello");
});

test("leaves what it does not answer to an interceptor from before it", async () => {
  const answered = before.length;
  const response = await fetch("/mocked");
  expect(await response.text()).toBe("mocked by the test");
  expect(before.length).toBe(answered + 1);
});

test("leaves what nobody answers to the DOM, which sends it", async () => {
  const { port } = network.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/network`);
  expect(await response.text()).toBe("network /network");
});

test("ends happy-dom's task of a request that is aborted while the app answers it", async () => {
  const request = new XMLHttpRequest();
  const ended = new Promise((resolve) => (request.onloadend = resolve));
  request.open("GET", "/slow");
  request.send();
  await vi.waitUntil(() => asked.at(-1)?.url.endsWith("/slow"));
  request.abort();
  await ended;
  await happyDOM.waitUntilComplete();
});

// The events of a link of the page, from when it is in the document until
// a task after happy-dom answers it, or the host would.
async function eventsOf(attributes: Record<string, string>): Promise<string[]> {
  const link = document.createElement("link");
  const events: string[] = [];
  for (const type of ["load", "error"]) link.addEventListener(type, () => events.push(type));
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
  document.head.append(link);
  await new Promise((resolve) => setTimeout(resolve, 10));
  link.remove();
  return events;
}

test("a preload of a stylesheet loads once, which happy-dom never answers itself", async () => {
  expect(await eventsOf({ rel: "preload", as: "style", href: "/a.css" })).toEqual(["load"]);
});

test("a stylesheet loads once: happy-dom answers it itself, as the plugin sets it to", async () => {
  settings.handleDisabledFileLoadingAsSuccess = true;
  expect(await eventsOf({ rel: "stylesheet", href: "/b.css" })).toEqual(["load"]);
});

test("a preload of a stylesheet loads also under a test's fake timers", async () => {
  vi.useFakeTimers();
  try {
    const link = document.createElement("link");
    const loaded = new Promise((resolve) => link.addEventListener("load", resolve));
    for (const [name, value] of Object.entries({ rel: "preload", as: "style", href: "/c.css" })) {
      link.setAttribute(name, value);
    }
    document.head.append(link);
    await loaded;
    link.remove();
  } finally {
    vi.useRealTimers();
  }
});

test("a preload of anything else gets no answer of the host", async () => {
  expect(await eventsOf({ rel: "preload", as: "font", href: "/d.woff2" })).toEqual([]);
});
