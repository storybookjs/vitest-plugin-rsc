// @vitest-environment happy-dom
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// The host of a page in a worker of Node.js with happy-dom: the page's fetch
// API stays happy-dom's, and its interceptor hands the page's requests to
// what answers them, of fetch and of XMLHttpRequest alike.

// What worker-web-apis.ts keeps with `--import`, which this test has not: the
// server's web APIs are not what it is about.
vi.hoisted(() => {
  (globalThis as Record<PropertyKey, unknown>)[Symbol.for("vitest-plugin-rsc:worker-web-apis")] =
    globalThis;
});

const { nodeHost } = await import("./node-host.ts");

// A response of the server's web APIs, which are not the DOM's: what the
// page gets of it is the DOM's own.
function serverResponse(text: string, init: { status?: number; headers: [string, string][] }) {
  return {
    status: init.status ?? 200,
    statusText: "",
    url: "http://localhost:3000/answered",
    redirected: true,
    headers: {
      forEach: (each: (value: string, name: string) => void) =>
        init.headers.forEach(([name, value]) => each(value, name)),
    },
    body: new Blob([text]).stream(),
  } as unknown as Response;
}

// Where the requests that the host leaves to the network go.
const network = createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.end(`network ${request.url}`);
});
beforeAll(() => new Promise<void>((resolve) => network.listen(0, "127.0.0.1", resolve)));
afterAll(() => network.close());

const asked: Request[] = [];
const host = nodeHost("http://127.0.0.1:1");
const handedOver = host.interceptRequests(async (request) => {
  asked.push(request);
  if (request.url.includes("/network")) return undefined;
  return serverResponse(`answer of ${request.method} ${new URL(request.url).pathname}`, {
    status: 201,
    headers: [
      ["content-type", "text/plain"],
      ["set-cookie", "session=1"],
    ],
  });
});

test("hands the page's requests over, and the page gets the DOM's own response without Set-Cookie", async () => {
  expect(handedOver).toBe(true);
  const response = await fetch("/page");
  expect(asked.at(-1)).toBeInstanceOf(Request);
  expect(response).toBeInstanceOf(Response);
  expect(response.status).toBe(201);
  expect(response.headers.get("content-type")).toBe("text/plain");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.url).toBe("http://localhost:3000/answered");
  expect(response.redirected).toBe(true);
  expect(await response.text()).toBe("answer of GET /page");
});

test("an XMLHttpRequest goes the same way", async () => {
  const request = new XMLHttpRequest();
  await new Promise((resolve) => {
    request.onloadend = resolve;
    request.open("GET", "/xhr");
    request.send();
  });
  expect(request.status).toBe(201);
  expect(request.responseText).toBe("answer of GET /xhr");
  expect(request.getResponseHeader("set-cookie")).toBeNull();
});

test("a form with a file is the bytes of a form of the DOM's", async () => {
  const form = new FormData();
  form.append("title", "a note");
  form.append("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
  await fetch("/upload", { method: "POST", body: form });
  const request = asked.at(-1)!;
  expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
  const body = await request.text();
  expect(body).toContain('name="file"; filename="hello.txt"');
  expect(body).toContain("hello");
  // A body that the page reads with its own `Response` is the DOM's too.
  expect(await new Response(new Blob(["bytes"])).text()).toBe("bytes");
});

test("a request with no answer goes to the network, sent by the DOM", async () => {
  const { port } = network.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/network`);
  expect(await response.text()).toBe("network /network");
});
