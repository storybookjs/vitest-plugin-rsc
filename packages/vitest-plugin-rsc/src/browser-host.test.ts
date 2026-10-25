import { expect, test, vi } from "vitest";
import type { PageNews } from "./page-host.ts";
import { answerEvent } from "./page-protocol.ts";

// The host of a page in a browser: the answers and the news of the dev server
// come on one socket, in the order the server sent them.

const sockets: Socket[] = [];
class Socket extends EventTarget {
  static readonly OPEN = 1;
  readyState = 0;
  constructor() {
    super();
    sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(raw: string) {
    const { data } = JSON.parse(raw) as { data: { id: string } };
    // The server tells news, and then answers.
    this.receive({ type: "custom", event: "changed", data: 1 });
    this.receive({ type: "custom", event: answerEvent, data: { id: data.id, result: 42 } });
  }
  receive(message: object) {
    const data = JSON.stringify(message);
    setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data })));
  }
}

vi.stubGlobal("WebSocket", Socket);
vi.stubGlobal("window", { location: new URL("http://localhost:63315/") });
vi.stubGlobal("fetch", async () => Response.json({ token: "t", path: "/socket" }));
const { default: browserHost } = await import("./browser-host.ts");

test("hears the news before an answer that the server sent after it, and that it may have missed news once its socket closed", async () => {
  const heard: unknown[] = [];
  const news: PageNews = {
    heard: (event, data) => heard.push([event, data]),
    missed: () => heard.push("missed"),
  };
  browserHost.listen(news);

  expect(await browserHost.request("ask", {})).toBe(42);
  expect(heard).toEqual([["changed", 1]]);

  sockets[0]!.dispatchEvent(new Event("close"));
  expect(heard).toEqual([["changed", 1], "missed"]);
});
