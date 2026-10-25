import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ViteDevServer } from "vite";
import { expect, onTestFinished, test, vi } from "vitest";
import { channelTo } from "./node-channel.ts";
import { answerPageWith, listenForPage, tellPages } from "./page-bridge.ts";
import { pageNewsPath, toldHeader } from "./page-protocol.ts";

// The channel of a page in a worker of Node.js to the dev server: its
// questions, and the server's news in order with the answers, as a page in a
// browser hears both on its socket.

test("hears the news that the dev server told before an answer, before the answer", async () => {
  const server = {
    middlewares: () => {},
    config: { logger: { error: () => {} } },
  } as unknown as ViteDevServer;
  let changes = 0;
  answerPageWith(server, "change", () => {
    tellPages(server, "changed", ++changes);
    return changes;
  });
  const channel = channelTo(await listenForPage(server));
  const heard: unknown[] = [];
  channel.listen({ heard: (_, data) => heard.push(data), missed: () => heard.push("missed") });

  for (let i = 0; i < 20; i++) {
    const answer = await channel.request("change", {});
    expect(heard.at(-1)).toBe(answer);
  }
  expect(heard).toHaveLength(20);
});

// A dev server whose answer, which says it told one piece of news before it,
// comes before that news, which the test writes to the stream.
async function answerBeforeItsNews(answer: string) {
  let stream: http.ServerResponse | undefined;
  let answered: () => void;
  const sent = new Promise<void>((resolve) => (answered = resolve));
  const listener = http.createServer((request, response) => {
    if (request.url === pageNewsPath) {
      response.write(`${JSON.stringify({ told: 0 })}\n`);
      stream = response;
      return;
    }
    response.setHeader(toldHeader, 1);
    response.end(answer, answered);
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => {
    listener.closeAllConnections();
    listener.close();
  });
  const { port } = listener.address() as AddressInfo;
  const channel = channelTo(`http://127.0.0.1:${port}`);
  const heard: unknown[] = [];
  channel.listen({ heard: (_, data) => heard.push(data), missed: () => heard.push("missed") });
  const tell = (...pieces: { told: number; data: unknown }[]) =>
    stream!.write(
      pieces
        .map(({ told, data }) => `${JSON.stringify({ told, event: "changed", data })}\n`)
        .join(""),
    );
  return { channel, heard, sent, tell, stream: () => stream! };
}

test("holds an answer until the news before it has come on the stream, and hears that it may have missed news once the stream closes", async () => {
  const { channel, heard, sent, tell, stream } = await answerBeforeItsNews("42");

  let answer: unknown;
  const asking = channel.request("ask", {}).then((result) => (answer = result));
  await sent;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(answer).toBeUndefined();

  tell({ told: 1, data: "changed" });
  await asking;
  expect(answer).toBe(42);
  expect(heard).toEqual(["changed"]);

  stream().end();
  await vi.waitFor(() => expect(heard).toEqual(["changed", "missed"]));
});

test("says the page missed news when news the server told after an answer comes before the answer is done", async () => {
  const { channel, heard, sent, tell } = await answerBeforeItsNews("5");

  const asking = channel
    .request("version", {})
    .then((result) => heard.push(`answer ${String(result)}`));
  await sent;
  // Version 5 and then 6, in one chunk, with the answer of version 5 waiting.
  tell({ told: 1, data: 5 }, { told: 2, data: 6 });
  await asking;

  // The page asks again, where it would keep the answer's version 5.
  expect(heard).toEqual([5, 6, "missed", "answer 5"]);
});
