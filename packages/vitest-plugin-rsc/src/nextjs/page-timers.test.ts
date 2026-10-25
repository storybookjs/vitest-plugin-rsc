import type { Plugin } from "vite";
import { expect, test } from "vitest";
import { rolldown } from "rolldown";
import { pageTimersDefine, pageTimersPlugin } from "./page-timers.ts";

const plugin = pageTimersPlugin("react_client", (file) => file.endsWith(".test.tsx"));
const { handler, filter } = plugin.transform as unknown as {
  handler(
    this: { warn(message: string): void },
    code: string,
    id: string,
  ): Promise<{ code: string } | undefined>;
  filter: { code: RegExp };
};
// A dev server's, whose optimizer writes to `/app/node_modules/.vite/`.
const environment = {
  mode: "dev",
  depsOptimizer: { isOptimizedDepFile: (id: string) => id.startsWith("/app/node_modules/.vite/") },
};
const compile = async (code: string, id = "/app/theme.js") =>
  (await handler.call({ environment, warn: () => {} } as never, code, id))?.code;

test("has the browser layer call a timer of the module's runner", async () => {
  expect(plugin.applyToEnvironment?.({ name: "react_client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(false);
  expect(await compile(`setTimeout(() => {}, 1);`)).toContain(
    "__vite_ssr_import_meta__.__vitest_plugin_rsc_timers__.setTimeout(",
  );
  expect(await compile(`const raf = typeof requestAnimationFrame === "function";`)).toContain(
    "typeof __vite_ssr_import_meta__.__vitest_plugin_rsc_timers__.requestAnimationFrame",
  );
  // A polyfill's write, which writes the global.
  expect(await compile(`requestIdleCallback = requestIdleCallback || shim;`)).toContain(
    "__vite_ssr_import_meta__.__vitest_plugin_rsc_timers__.requestIdleCallback =",
  );
});

test("leaves a binding of the same name, and code without a timer", async () => {
  expect(await compile(`function f(setTimeout) { setTimeout(); }`)).not.toContain(
    "__vitest_plugin_rsc_timers__",
  );
  expect(filter.code.test(`const x = 1;`)).toBe(false);
  expect((plugin as Plugin).enforce).toBe("post");
});

test('leaves a file of the host, like a test file with "use client", whose timers a spy of the test is on', async () => {
  expect(await compile(`setTimeout(() => {}, 1);`, "/app/client.test.tsx")).toBeUndefined();
});

test("leaves a pre-bundled dependency to the optimizer, whose define replaces the timers", async () => {
  expect(
    await compile(`setTimeout(() => {}, 1);`, "/app/node_modules/.vite/deps/chunk.js"),
  ).toBeUndefined();
  // A static build has no optimizer: there the plugin compiles a dependency.
  const built = await handler.call(
    { environment: { mode: "build" }, warn: () => {} } as never,
    `setTimeout(() => {}, 1);`,
    "/app/node_modules/.vite/deps/chunk.js",
  );
  expect(built?.code).toContain("__vitest_plugin_rsc_timers__.setTimeout(");
  const build = await rolldown({
    input: "/dependency.js",
    plugins: [
      {
        name: "dependency",
        resolveId: (id) => id,
        load: () =>
          `export const later = (f) => setTimeout(f, 1);\nexport const own = (setTimeout) => setTimeout;`,
      },
    ],
    transform: { define: pageTimersDefine },
  });
  const { output } = await build.generate({ format: "esm" });
  expect(output[0].code).toContain(
    "__vite_ssr_import_meta__.__vitest_plugin_rsc_timers__.setTimeout(f, 1)",
  );
  expect(output[0].code).toMatch(/\(setTimeout\) => setTimeout/);
});
