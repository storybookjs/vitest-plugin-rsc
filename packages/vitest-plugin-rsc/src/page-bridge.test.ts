import http from "node:http";
import type { ViteDevServer } from "vite";
import { expect, test } from "vitest";
import { answerPageWith, listenForPage } from "./page-bridge.ts";
import { pageRequestPath } from "./page-protocol.ts";

// The listener of a page in a worker of Node.js: it answers the page's
// questions, and only the page's, which names the listener by its own host.

const server = {
  middlewares: (_: http.IncomingMessage, response: http.ServerResponse) => {
    response.statusCode = 418;
    response.end();
  },
  config: { logger: { error: () => {} } },
} as unknown as ViteDevServer;
answerPageWith(server, "echo", (question) => ({ asked: question }));
const origin = await listenForPage(server);

function post(headers: Record<string, string>, path = pageRequestPath) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = http.request(
      `${origin}${path}`,
      { method: "POST", agent: false, headers },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve({ status: response.statusCode!, body }));
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify({ event: "echo", data: { a: 1 } }));
  });
}

test("answers the page, which sends JSON to the listener's own host", async () => {
  expect(await post({ "content-type": "application/json" })).toEqual({
    status: 200,
    body: JSON.stringify({ asked: { a: 1 } }),
  });
});

test("not a name of another site that resolves to the loopback", async () => {
  const answer = await post({ "content-type": "application/json", host: "evil.example:80" });
  expect(answer.status).toBe(403);
});

test("not a request of a page that needs no preflight of CORS", async () => {
  const answer = await post({ "content-type": "text/plain" });
  expect(answer.status).toBe(403);
});

test("any other request is the dev server's", async () => {
  expect((await post({ "content-type": "application/json" }, "/notes")).status).toBe(418);
});
