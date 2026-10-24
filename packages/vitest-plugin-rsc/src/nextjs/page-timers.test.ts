import { rolldown } from "rolldown";
import type { Plugin } from "vite";
import { expect, test } from "vitest";
import { pageTimersDefine, pageTimersPlugin } from "./page-timers.ts";

const plugin = pageTimersPlugin("react_client", (file) => file.endsWith(".test.tsx"));
const { handler, filter } = plugin.transform as unknown as {
  handler(
    this: { warn(message: string): void; environment: unknown },
    code: string,
    id: string,
  ): Promise<{ code: string } | undefined>;
  filter: { code: RegExp };
};
// The browser layer's dev server, whose optimizer has bundled the files of
// `/deps/`.
const environment = {
  depsOptimizer: { isOptimizedDepFile: (id: string) => id.startsWith("/deps/") },
};
const compile = async (code: string, id = "/app/theme.js") =>
  (await handler.call({ warn: () => {}, environment }, code, id))?.code;

// A dependency as the browser layer's optimizer bundles it, with the
// `define` of its options.
async function prebundle(code: string): Promise<string> {
  const build = await rolldown({
    input: "dependency.js",
    plugins: [{ name: "dependency", resolveId: (id) => id, load: () => code }],
    transform: { define: pageTimersDefine },
    logLevel: "silent",
  });
  const { output } = await build.generate({ format: "esm" });
  return output[0].code;
}

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

test("has the optimizer bundle a dependency with the timers of the module's runner", async () => {
  const code = await prebundle(`
    export const later = () => setTimeout(() => {}, 1);
    export const raf = typeof requestAnimationFrame === "function";
    requestIdleCallback = requestIdleCallback || (() => {});
    export function own(setTimeout) { return setTimeout(); }
  `);
  expect(code).toContain("__vite_ssr_import_meta__.__vitest_plugin_rsc_timers__.setTimeout(");
  expect(code).toContain(
    "typeof __vite_ssr_import_meta__.__vitest_plugin_rsc_timers__.requestAnimationFrame",
  );
  expect(code).toContain(
    "__vite_ssr_import_meta__.__vitest_plugin_rsc_timers__.requestIdleCallback =",
  );
  // A parameter of the same name stays.
  expect(code).toMatch(/function own\((\w+)\) \{\s*return \1\(\);/);
});

test("leaves a chunk of the optimizer to it, which has rewritten it already", async () => {
  const chunk = await prebundle(`export const later = () => setTimeout(() => {}, 1);`);
  // Its code still names a timer, so it passes the filter, and the dev
  // server's transform has to leave it.
  expect(filter.code.test(chunk)).toBe(true);
  expect(await compile(chunk, "/deps/chunk-abc.js")).toBeUndefined();
  // Should the dev server compile it after all, it would come out the same.
  expect(await compile(chunk)).not.toContain(
    "__vitest_plugin_rsc_timers__.__vite_ssr_import_meta__",
  );
  expect((await compile(chunk))?.match(/__vitest_plugin_rsc_timers__/g)).toHaveLength(1);
});
