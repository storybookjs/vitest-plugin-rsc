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

const request = () => ({ url: "http://localhost/", method: "GET", headers: new Headers() });

type NodeResponse = { write(chunk: string): void; end(chunk: string): void };

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
