import http from "node:http";
import type { ViteDevServer } from "vite";
import { expect, test } from "vitest";
import { answerOf, answerPageWith, listenForPage } from "./page-bridge.ts";

const server = {
  middlewares: (_: http.IncomingMessage, response: http.ServerResponse) => {
    response.statusCode = 418;
    response.end();
  },
  config: { logger: { error: () => {} } },
} as unknown as ViteDevServer;
answerPageWith(server, "echo", (question) => ({ asked: question }));

test("answers what the page asks at an event, and nothing at another", async () => {
  expect(await answerOf(server, "echo", { a: 1 })).toEqual({ result: { asked: { a: 1 } } });
  expect(await answerOf(server, "other", {})).toBeUndefined();
});

// The origin of a page in a worker of Node.js: the files of the dev server.
test("listens for a page in a worker of Node.js with the dev server's files", async () => {
  const origin = await listenForPage(server);
  const status = await new Promise<number | undefined>((resolve, reject) =>
    http
      .get(`${origin}/notes`, { agent: false }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
      .on("error", reject),
  );
  expect(status).toBe(418);
  expect(await listenForPage(server)).toBe(origin);
});
