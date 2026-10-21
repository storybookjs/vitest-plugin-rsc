import { Readable } from "node:stream";
import { expect, test, vi } from "vitest";
import { handleRequest } from "./node-server.ts";
import { registry, type RequestHandler } from "./registry.ts";

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

test.each<[string, RequestHandler, (response: Response) => Promise<unknown>]>([
  [
    "ends the page",
    async (_, res) => (res as NodeResponse).end("<html></html>"),
    async (response) => expect(await response.text()).toBe("<html></html>"),
  ],
  [
    "fails after the head",
    async (_, res) => {
      (res as NodeResponse).write("<html>");
      throw new Error("failed after the head");
    },
    (response) => expect(response.text()).rejects.toThrow("failed after the head"),
  ],
])(
  "lets go of a response once it is read and Next's handler, which %s, is done with it",
  async (_, handler, read) => {
    // A separate function, so that no frame of the test keeps the last one.
    async function readResponse(): Promise<WeakRef<Response>> {
      const response = await handleRequest(request(), {}, handler);
      await read(response);
      return new WeakRef(response);
    }
    const responses: WeakRef<Response>[] = [];
    for (let pages = 0; pages < 20; pages++) responses.push(await readResponse());

    await expect
      .poll(() => {
        gc();
        // Not the responses themselves: the assertion would keep them.
        return responses.filter((of) => of.deref() !== undefined).length;
      })
      .toBe(0);
  },
);

type Answer = (response: Promise<Response>) => Promise<Response | void>;

test.each<[string, (res: NodeResponse) => void, Answer]>([
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
    "fails before the head",
    () => {
      throw new Error("failed before the head");
    },
    // Not `rejects`, which keeps the error, and through its stack the
    // handler that threw it.
    async (answer) => {
      const failure = await answer.then(String, (error: Error) => error.message);
      expect(failure).toBe("failed before the head");
    },
  ],
])(
  "lets go of a response once Next's handler, which %s, is done with it, while the signal of its request stays",
  async (_, handle, read) => {
    // A signal that outlives its requests, like the one of a page.
    const page = new AbortController();
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
    const responses: WeakRef<object>[] = [];
    for (let pages = 0; pages < 20; pages++) responses.push(...(await readResponse()));

    await expect
      .poll(() => {
        gc();
        return responses.filter((of) => of.deref() !== undefined).length;
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
