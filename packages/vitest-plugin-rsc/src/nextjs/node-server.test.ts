import { Readable } from "node:stream";
import { expect, test, vi } from "vitest";
import { handleRequest, setStylesheets } from "./node-server.ts";
import { registry } from "./registry.ts";

// What the plugin gives the module in the app's server layers.
vi.mock("virtual:vitest-plugin-rsc/next-manifest", () => ({
  nextConfig: {},
  preview: {},
  routesManifest: {},
  routing: { buildId: "test" },
}));
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

// What Next's renderer reads to preload the fonts of a segment, by the name
// of its file in the loader tree.
test("lists the fonts of each file as Next's manifest of fonts, from its stylesheets", () => {
  setStylesheets({
    "app/layout": [
      {
        path: "static/css/a/font.css",
        fonts: ["static/media/a-s.p.woff2", "static/media/b.woff2"],
      },
      { path: "static/css/a/global.css" },
    ],
    // A font with `preload: false`: Next adds a preconnect for it.
    "app/page": [{ path: "static/css/b/font.css", fonts: ["static/media/c-s.woff2"] }],
    "app/other/page": [{ path: "static/css/a/global.css" }],
  });
  const manifest = registry.node.loadManifest!("/.next/server/next-font-manifest.json") as {
    app: Record<string, string[]>;
  };

  expect(manifest.app["app/layout"]).toEqual(["static/media/a-s.p.woff2"]);
  expect(manifest.app["app/page"]).toEqual([]);
  expect(manifest.app["app/other/page"]).toBeUndefined();

  // Another request of the file: what it has now.
  setStylesheets({ "app/layout": [{ path: "static/css/a/global.css" }] });
  expect(manifest.app["app/layout"]).toBeUndefined();
});
