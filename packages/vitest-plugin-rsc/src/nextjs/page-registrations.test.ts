import { expect, test } from "vitest";
import {
  compileNextFile,
  isNextFile,
  nextRegistrationsPlugin,
  pageRegistrationsDefine,
} from "./page-registrations.ts";

const nextDir = "/app/node_modules/next";
const file = `${nextDir}/dist/client/components/router-reducer/fetch-server-response.js`;
const ofRunner = "__vite_ssr_import_meta__.__vitest_plugin_rsc_registrations__";

const compile = async (code: string) => (await compileNextFile(code, file))?.code;

test("has a file of Next's register through its runner: a call, a read, typeof, a write", async () => {
  expect(await compile(`setTimeout(() => {}, 1);`)).toContain(`${ofRunner}.setTimeout(`);
  expect(await compile(`const raf = typeof requestAnimationFrame === "function";`)).toContain(
    `typeof ${ofRunner}.requestAnimationFrame`,
  );
  // A polyfill's write, which writes the global.
  expect(await compile(`requestIdleCallback = requestIdleCallback || shim;`)).toContain(
    `${ofRunner}.requestIdleCallback =`,
  );
  expect(await compile(`const channel = new MessageChannel();`)).toContain(
    `new ${ofRunner}.MessageChannel()`,
  );
  expect(await compile(`new PerformanceObserver(() => {}).observe({ type: "paint" });`)).toContain(
    `new ${ofRunner}.PerformanceObserver(`,
  );
});

test("has it register its listeners on window and document through its runner", async () => {
  expect(await compile(`window.addEventListener("pagehide", onHide);`)).toContain(
    `${ofRunner}.addEventListener("pagehide", onHide)`,
  );
  expect(await compile(`addEventListener("pageshow", onShow);`)).toContain(
    `${ofRunner}.addEventListener("pageshow", onShow)`,
  );
  expect(await compile(`self.removeEventListener("pageshow", onShow);`)).toContain(
    `${ofRunner}.removeEventListener("pageshow", onShow)`,
  );
  expect(await compile(`document.addEventListener("visibilitychange", onChange, true);`)).toContain(
    `${ofRunner}.documentAddEventListener("visibilitychange", onChange, true)`,
  );
  expect(await compile(`document.removeEventListener("visibilitychange", onChange);`)).toContain(
    `${ofRunner}.documentRemoveEventListener("visibilitychange", onChange)`,
  );
  // A listener on an element is the element's.
  expect(await compile(`setTimeout(f); el.addEventListener("click", onClick);`)).toContain(
    `el.addEventListener("click", onClick)`,
  );
});

test("leaves a binding of the same name, and a file that names none of the globals", async () => {
  expect(await compile(`function f(setTimeout) { setTimeout(); }`)).not.toContain(ofRunner);
  expect(await compile(`const x = 1;`)).toBeUndefined();
});

test("compiles the other constants of a static build with it", async () => {
  const compiled = await compileNextFile(
    `if (process.env.NODE_ENV === "test") setTimeout(f);`,
    file,
    {
      "process.env.NODE_ENV": '"production"',
    },
  );

  expect(compiled?.code).toContain(`"production"`);
  expect(compiled?.code).toContain(`${ofRunner}.setTimeout(f)`);
  expect(compiled?.code).not.toContain("process.env");
});

test("is for the files of next/dist, not for the app's or another package's", () => {
  expect(isNextFile(nextDir, file)).toBe(true);
  expect(
    isNextFile(nextDir, `${nextDir}/dist/compiled/react-dom/cjs/react-dom-client.development.js`),
  ).toBe(true);
  expect(isNextFile(nextDir, `${nextDir}/dist/esm/client/image-component.js`)).toBe(true);
  expect(isNextFile(nextDir, "/app/node_modules/next-themes/dist/index.mjs")).toBe(false);
  expect(isNextFile(nextDir, "/app/app/theme.tsx")).toBe(false);
  expect(isNextFile(nextDir, `${nextDir}/package.json`)).toBe(false);
  // The optimizer's plugin has the same filter.
  const { filter } = nextRegistrationsPlugin(nextDir).transform as { filter: { id: RegExp } };
  expect(filter.id.test(file)).toBe(true);
  expect(filter.id.test("/app/node_modules/next-themes/dist/index.mjs")).toBe(false);
});

test("names each global as itself, and on globalThis, self and window", () => {
  expect(pageRegistrationsDefine["setTimeout"]).toBe(`${ofRunner}.setTimeout`);
  expect(pageRegistrationsDefine["globalThis.setTimeout"]).toBe(`${ofRunner}.setTimeout`);
  expect(pageRegistrationsDefine["self.MessageChannel"]).toBe(`${ofRunner}.MessageChannel`);
  expect(pageRegistrationsDefine["window.addEventListener"]).toBe(`${ofRunner}.addEventListener`);
  expect(pageRegistrationsDefine["document.addEventListener"]).toBe(
    `${ofRunner}.documentAddEventListener`,
  );
  expect(pageRegistrationsDefine["document.setTimeout"]).toBeUndefined();
});
