import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { expect, test } from "vitest";
import type { NextLayer, NextProject } from "./project.ts";
import { createUseCachePlugin, useCacheModule } from "./use-cache.ts";

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

test("known limit: leaves a function with the directive in a module that has it at its top", async () => {
  // Next's compiler caches both: the module's directive is for what it exports.
  const code = await compile(
    `"use cache";\nexport async function a() { return b(); }\nasync function b() { "use cache"; }`,
  );

  expect(calls(code)).toEqual([["default", "a", "0"]]);
});

// The module that compiled code imports `useCache()` from, with what it
// imports itself: Next's wrapper, which says what it was called with here,
// and React's `cache()`.
function loadUseCache(generation: number) {
  const source = useCacheModule("registry")
    .replace(/^import .*$/gm, "")
    .replace("export function", "return function");
  return runInThisContext(`(function (cache, reactCache, registry) { ${source} })`)(
    (...args: unknown[]) => args,
    (fn: unknown) => fn,
    { cacheGeneration: () => generation },
  ) as (kind: string, id: string, fn: unknown, undeclared: number | null) => Function;
}

test("hands Next's wrapper the arguments that the function declares", () => {
  const useCache = loadUseCache(0);
  const quote = function quote(_topic: string, _language = "en") {};
  const all = function all(..._topics: string[]) {};

  // `map()` also passes an index and the array.
  expect(useCache("default", "id", quote, 1)("a", "nl", 0, ["a"])).toEqual([
    "default",
    "id:0",
    0,
    quote,
    ["a", "nl"],
  ]);
  expect(useCache("remote", "id", all, null)("a", "b", "c").at(-1)).toEqual(["a", "b", "c"]);
});

test("gives the cached function the name of the function", () => {
  expect(loadUseCache(0)("default", "id", function quote() {}, 0).name).toBe("quote");
});

test("keys a cached function by the reset of the caches it was called after", () => {
  const key = (generation: number) => loadUseCache(generation)("default", "id", () => {}, 0)()[1];

  expect(key(1)).toBe("id:1");
  expect(key(2)).toBe("id:2");
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
