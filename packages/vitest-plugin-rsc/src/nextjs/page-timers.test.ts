import type { Plugin } from "vite";
import { expect, test } from "vitest";
import { pageTimersPlugin } from "./page-timers.ts";

const plugin = pageTimersPlugin("react_client");
const { handler, filter } = plugin.transform as unknown as {
  handler(
    this: { warn(message: string): void },
    code: string,
    id: string,
  ): Promise<{ code: string }>;
  filter: { code: RegExp };
};
const compile = async (code: string) =>
  (await handler.call({ warn: () => {} }, code, "/app/theme.js")).code;

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
