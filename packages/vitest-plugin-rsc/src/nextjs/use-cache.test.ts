import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { NextLayer, NextProject } from "./project.ts";
import { createUseCachePlugin } from "./use-cache.ts";

// A file that is there: a module of the plugin is one of a file.
const file = fileURLToPath(import.meta.url);

type Config = { cacheComponents?: boolean; experimental?: { useCache?: boolean } };

async function compile(
  code: string,
  { config = { cacheComponents: true } as Config, layer = "rsc" as NextLayer, appCode = true } = {},
): Promise<string | undefined> {
  const plugin = createUseCachePlugin(
    () => ({ config }) as unknown as NextProject,
    () => layer,
    () => appCode,
  );
  const transform = plugin.transform as unknown as (
    this: object,
    code: string,
    id: string,
  ) => Promise<{ code: string } | undefined>;
  return (await transform.call({ environment: { name: "client" } }, code, file))?.code;
}

// The call a function is wrapped in: its kind, its name, and how many of its
// parameters its `length` does not count.
const calls = (code: string | undefined) =>
  [
    ...(code ?? "").matchAll(/\$\$useCache\("([^"]+)", "[0-9a-f]{16}:([^"]+)", [^,]+, (\w+)\)/g),
  ].map(([, kind, name, undeclared]) => [kind, name, undeclared]);

test("wraps a function with the directive in a call of the cache wrapper", async () => {
  const code = await compile(
    `export async function getQuote(topic) { "use cache"; return topic; }`,
  );

  expect(code).toMatch(/^import \{ useCache as \$\$useCache \} from "virtual:.*next-use-cache";\n/);
  expect(calls(code)).toEqual([["default", "$$hoist_0_getQuote", "0"]]);
});

test("passes the kind of the cache handler", async () => {
  const code = await compile(`export const get = async () => { "use cache: remote"; return 1; };`);

  expect(calls(code)).toEqual([["remote", "$$hoist_0_get", "0"]]);
});

test("wraps every function that a module with the directive exports", async () => {
  const code = await compile(
    `"use cache";\nexport async function a() {}\nexport const b = async () => 1;\nconst c = async () => 2;`,
  );

  expect(calls(code)).toEqual([
    ["default", "a", "0"],
    ["default", "b", "0"],
  ]);
});

test("says which parameters the length of a function does not count", async () => {
  // From the first one with a default value on.
  expect(
    calls(await compile(`export async function f({ a }, b = 1, c) { "use cache"; return a; }`)),
  ).toEqual([["default", "$$hoist_0_f", "2"]]);
  // A function that takes the rest of its arguments is called with all of them.
  expect(calls(await compile(`export async function f(a, ...rest) { "use cache"; }`))).toEqual([
    ["default", "$$hoist_0_f", "null"],
  ]);
});

test("leaves the directive where Next's compiler does not take it", async () => {
  const code = `export async function getQuote(topic) { "use cache"; return topic; }`;

  expect(await compile(code, { config: {} })).toBeUndefined();
  expect(await compile(code, { config: { experimental: { useCache: true } } })).toBeDefined();
  // A cached function runs in the rsc layer.
  expect(await compile(code, { layer: "ssr" })).toBeUndefined();
  // And is code of the app: not a test file.
  expect(await compile(code, { appCode: false })).toBeUndefined();
});
