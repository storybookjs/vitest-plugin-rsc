import type { DevEnvironment, ViteDevServer } from "vite";
import { expect, test, vi } from "vitest";
import { warmPageEnvironments } from "./warmup.ts";

// A page in a worker of Node.js: the plugin compiles what `dev.warmup`
// names, and what that imports, in the environments that the page runs.

function environmentOf(name: string, warmup: string[], imports: Record<string, string[]>) {
  const warmed: string[] = [];
  const environment = {
    name,
    config: { consumer: "client", dev: { warmup } },
    warmupRequest: vi.fn(async (url: string) => void warmed.push(url)),
    moduleGraph: {
      getModuleByUrl: async (url: string) => ({ transformResult: { deps: imports[url] ?? [] } }),
    },
  } as unknown as DevEnvironment;
  return { environment, warmed };
}

test("compiles the files of `dev.warmup` and their imports, once, in the page's environments", async () => {
  const browser = environmentOf("react_client", ["/root/app/client.tsx", "/elsewhere/entry.js"], {
    "/app/client.tsx": ["/app/a.ts", "/app/b.ts"],
    "/app/a.ts": ["/app/b.ts", "/node_modules/.vite/deps_react_client/react.js?v=1"],
  });
  const rsc = environmentOf("client", ["/root/app/rsc.tsx"], {});
  const server = {
    config: { root: "/root" },
    environments: { react_client: browser.environment, client: rsc.environment },
  } as unknown as ViteDevServer;

  warmPageEnvironments(server);
  await vi.waitFor(() => expect(browser.warmed).toHaveLength(5));
  expect(browser.warmed.toSorted()).toEqual([
    "/@fs/elsewhere/entry.js",
    "/app/a.ts",
    "/app/b.ts",
    "/app/client.tsx",
    "/node_modules/.vite/deps_react_client/react.js?v=1",
  ]);
  // Vitest's own environment, which its runner fetches from.
  expect(rsc.warmed).toEqual([]);
});
